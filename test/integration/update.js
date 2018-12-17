/* @flow */
/* eslint-env mocha */

const Promise = require('bluebird')
const _ = require('lodash')
const should = require('should')

const logger = require('../../core/logger')

const Builders = require('../support/builders')
const { IntegrationTestHelpers } = require('../support/helpers/integration')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')

const log = logger({component: 'mocha'})

describe('Update file', () => {
  let builders, cozy, helpers, pouch, prep

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    builders = new Builders({cozy: cozyHelpers.cozy, pouch: this.pouch})
    cozy = cozyHelpers.cozy
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)
    pouch = helpers._pouch
    prep = helpers.prep

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  describe('local offline change with unsynced previous local change', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.outputFile('file', 'initial content')
      await helpers.local.scan()
      await helpers.syncAll()

      await helpers.local.syncDir.outputFile('file', 'first update')
      await helpers.local.scan()
    })

    it('synchronizes the latest change everywhere without conflicts', async () => {
      const secondUpdate = 'second update'
      await helpers.local.syncDir.outputFile('file', secondUpdate)
      await helpers.local.scan()
      await helpers.syncAll()
      await helpers.pullAndSyncAll()

      const trees = await helpers.treesNonEllipsized()
      const contents = {
        local: await Promise.reduce(
          trees.local,
          async (localContents, path) => {
            localContents[path] = await helpers.local.syncDir.readFile(path)
            return localContents
          },
          {}
        ),
        remote: await Promise.reduce(
          trees.remote,
          async (remoteContents, path) => {
            remoteContents[path] = await helpers.remote.readFile(path)
            return remoteContents
          },
          {}
        )
      }
      should({trees, contents}).deepEqual({
        trees: {
          local: ['file'],
          remote: ['file']
        },
        contents: {
          local: {file: secondUpdate},
          remote: {file: secondUpdate}
        }
      })
    })
  })

  describe('local inode-only change', () => {
    // OPTIMIZE: Don't trigger useless remote sync for local inode-only change
    it('works but triggers useless remote sync', async () => {
      const file = await builders.remote.file()
        .name('file')
        .data('Initial content')
        .create()
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      const was = await pouch.byRemoteIdMaybeAsync(file._id)

      await prep.updateFileAsync('local', _.defaults({ino: was.ino + 1}, was))
      await helpers.syncAll()
      const doc = await pouch.byRemoteIdMaybeAsync(file._id)
      should(doc).have.propertyByPath('remote', '_rev').not.eql(was.remote._rev)

      // Make sure there is no infinite loop
      await helpers.remote.pullChanges()
      await helpers.syncAll()
    })
  })

  describe('older timestamp change', () => {
    it('should keep the most recent timestamp to prevent 422 errors', async () => {
      const file = await builders.remote.file()
        .name('file')
        .data('Initial content')
        .timestamp(2018, 5, 15, 21, 1, 53)
        .create()
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      const was = await pouch.byRemoteIdMaybeAsync(file._id)
      should(was).have.property('updated_at', '2018-05-15T21:01:53Z')

      await prep.updateFileAsync('local', _.defaults({
        updated_at: '2017-05-15T21:01:53.000Z',
        tags: ['some new tag']
      }, was))
      helpers._sync.stopped = false
      await helpers.syncAll()
      const doc = await pouch.byRemoteIdMaybeAsync(file._id)
      should(doc.errors).be.undefined()
    })
  })

  describe('M1, local merge M1, M2, remote sync M1, local merge M2', () => {
    it('fails remote sync M1 & local merge M2', async () => {
      const file = await cozy.files.create('Initial content', {name: 'file'})
      await helpers.remote.pullChanges()
      await helpers.syncAll()

      log.info('-------- M1 --------')
      const m1 = 'M1'
      await helpers.local.syncDir.outputFile('file', m1)

      log.info('-------- local merge M1 --------')
      should(await helpers.local.syncDir.checksum('file')).equal('8x4e7yD2RzOhjFOAc+eDlg==')
      await prep.updateFileAsync('local', _.defaults(
        {
          md5sum: await helpers.local.syncDir.checksum('file'),
          size: 2
        },
        await pouch.byRemoteIdMaybeAsync(file._id)
      ))

      log.info('-------- M2 --------')
      const m2 = 'M2'
      await helpers.local.syncDir.outputFile('file', m2)

      log.info('-------- remote sync M1 --------')
      await helpers.syncAll()

      log.info('-------- local merge M2 --------')
      should(await helpers.local.syncDir.checksum('file')).equal('nYMiUwtn4jZuWxumcIHe2Q==')
      await prep.updateFileAsync('local', _.defaults(
        {
          md5sum: await helpers.local.syncDir.checksum('file'),
          size: 2
        },
        await pouch.byRemoteIdMaybeAsync(file._id)
      ))

      log.info('-------- remote sync M2 --------')
      await helpers.syncAll()

      should({
        localTree: await helpers.local.tree(),
        remoteTree: await helpers.remote.tree(),
        remoteFileContent: await helpers.remote.readFile('file')
      }).deepEqual({
        localTree: [
          'file'
        ],
        remoteTree: [
          '.cozy_trash/',
          'file'
        ],
        remoteFileContent: m2
      })
    })
  })
})
