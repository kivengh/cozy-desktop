const {describe, it} = require('mocha')
const remoteChange = require('../../../core/remote/change')

describe('remote change sort', () => {
  it('sort correctly move inside move', () => {
    const parent = {
      'doc': {'path': 'parent/dst/dir'},
      'type': 'FolderMove',
      'was': {'path': 'parent/src/dir'}
    }
    const child = {
      'doc': {'path': 'parent/dst/dir/subdir/filerenamed'},
      'type': 'FileMove',
      'was': {'path': 'parent/dst/dir/subdir/file'}
    }
    const a = [child, parent]
    remoteChange.sort(a)
    a.should.deepEqual([parent, child])
  })

  it('sort correctly interlocking renames', () => {
    const one = {
      'doc': {'path': 'parent/file4'},
      'type': 'FileMove',
      'was': {'path': 'parent/file3'}
    }
    const two = {
      'doc': {'path': 'parent/file3'},
      'type': 'FileMove',
      'was': {'path': 'parent/file2'}
    }
    const three = {
      'doc': {'path': 'parent/file2'},
      'type': 'FileMove',
      'was': {'path': 'parent/file1'}
    }
    const a = [three, two, one]
    remoteChange.sort(a)
    a.should.deepEqual([one, two, three])
  })
})
