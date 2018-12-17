/* eslint-env mocha */

const should = require('should')
const path = require('path')

const analysis = require('../../../core/local/analysis')

const Builders = require('../../support/builders')

/*::
import type { LocalEvent } from '../../../core/local/event'
import type { LocalChange } from '../../../core/local/change'
import type { Metadata } from '../../../core/metadata'
*/

describe('core/local/analysis', function () {
  const sideName = 'local'
  const builders = new Builders()

  describe('file changes', () => {
    it('do not break on empty array', () => {
      const events /*: LocalEvent[] */ = []
      const pendingChanges /*: LocalChange[] */ = []
      const result /*: LocalChange[] */ = analysis(events, pendingChanges)
      should(result).have.length(0)
    })

    it('handles partial successive moves (add+unlink+add, then unlink later)', () => {
      const old /*: Metadata */ = builders.metafile().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'add', path: 'dst1', stats, wip: true},
        {type: 'unlink', path: 'src', old},
        {type: 'add', path: 'dst2', stats, md5sum: 'yolo'}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'FileMove',
        path: 'dst2',
        ino: 1,
        md5sum: 'yolo',
        stats,
        old
      }])
      should(pendingChanges).deepEqual([])

      const nextEvents /*: LocalEvent[] */ = [
        {type: 'unlink', path: 'dst1'}
      ]
      should(analysis(nextEvents, pendingChanges)).deepEqual([])
      should(pendingChanges).deepEqual([])
    })

    it('handles unlink+add', () => {
      const old /*: Metadata */ = builders.metafile().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlink', path: 'src', old},
        {type: 'add', path: 'dst', stats, md5sum: 'yolo'}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'FileMove',
        path: 'dst',
        md5sum: 'yolo',
        ino: 1,
        stats,
        old
      }])
      should(pendingChanges).deepEqual([])
    })

    it('identifies a FileMove + an incomplete FileMove as an incomplete FileMove', () => {
      const old /*: Metadata */ = builders.metafile().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlink', path: 'src', old},
        {type: 'add', path: 'dst1', stats, md5sum: 'yolo'},
        // dropped: {type: 'unlink', path: 'dst1', old},
        {type: 'add', path: 'dst2', stats, wip: true}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([])
      should(pendingChanges).deepEqual([{
        sideName,
        type: 'FileMove',
        path: 'dst2',
        md5sum: undefined,
        ino: 1,
        wip: true,
        stats,
        old
      }])
    })

    it('identifies an incomplete FileMove + a complete FileMove as a complete FileMove', () => {
      const old /*: Metadata */ = builders.metafile().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlink', path: 'src', old},
        {type: 'add', path: 'dst1', stats, wip: true},
        // dropped: {type: 'unlink', path: 'dst1', old},
        {type: 'add', path: 'dst2', stats, md5sum: 'yolo'}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'FileMove',
        path: 'dst2',
        ino: 1,
        md5sum: 'yolo',
        stats,
        old
      }])
      should(pendingChanges).deepEqual([])
    })

    it('handles unlink(x,old=X)+add(X,old=X) (identical renaming loopback) as FileAddition(X) because we lack an x doc to build FileMove(x → X)', () => {
      const ino = 1
      const oldPath = 'x'
      const newPath = 'X'
      const old /*: Metadata */ = builders.metafile().path(newPath).ino(ino).build()
      const { md5sum } = old
      const stats = {ino}
      const events /*: LocalEvent[] */ = [
        {type: 'unlink', path: oldPath, old},
        {type: 'add', path: newPath, stats, md5sum, old}
      ]
      const pendingChanges = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'FileAddition',
        path: newPath,
        ino,
        md5sum,
        stats,
        old
      }])
    })

    it('handles unlink+add+change', () => {
      const old /*: Metadata */ = builders.metafile().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlink', path: 'src', old},
        {type: 'add', path: 'dst', stats, md5sum: old.md5sum},
        {type: 'change', path: 'dst', stats, md5sum: 'yata'}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'FileMove',
        path: 'dst',
        md5sum: old.md5sum,
        ino: 1,
        stats,
        old,
        update: {
          type: 'change',
          path: 'dst',
          stats,
          md5sum: 'yata'
        }
      }])
      should(pendingChanges).deepEqual([])
    })

    it('does not mistakenly identifies a partial file addition + a file change on same inode as an identical renaming', () => {
      const partiallyAddedPath = 'partially-added-file'
      const changedPath = 'changed-file'
      const old = builders.metafile().path(changedPath).ino(111).build()
      const ino = 222
      const md5sum = 'changedSum'
      const events /*: LocalEvent[] */ = [
        {type: 'add', path: partiallyAddedPath, stats: {ino}, old: null, wip: true},
        // In real life, the partially-added-file would be unlinked here.
        // But this would defeat the purpose of reproducing this issue.
        // So let's assume it was not.
        {type: 'change', path: changedPath, stats: {ino}, md5sum, old}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      const changes = analysis(events, pendingChanges)

      should({changes, pendingChanges}).deepEqual({
        changes: [
          {
            sideName,
            type: 'FileUpdate',
            path: changedPath,
            stats: {ino},
            ino,
            md5sum,
            old
          }
        ],
        pendingChanges: [
          // In real life, the temporary file should have been ignored.
          // Here, since it has the same inode as the change event, is is overridden.
          // So no pending change in the end.
        ]
      })
    })

    it('identifies add({path: FOO, ino: 1}) + change({path: foo, ino: 1}) as FileMove(foo, FOO)', () => {
      const old /*: Metadata */ = builders.metafile().path('foo').ino(1).build()
      const stats = {ino: 1}
      const { md5sum } = old
      const events /*: LocalEvent[] */ = [
        {type: 'add', path: 'FOO', stats, old, md5sum},
        {type: 'change', path: 'foo', stats, old, md5sum}
      ]
      const pendingChanges = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        update: {
          md5sum,
          old,
          path: 'FOO',
          stats,
          type: 'change'
        },
        type: 'FileMove',
        path: 'FOO',
        ino: 1,
        stats,
        old,
        md5sum
      }])
    })

    it('identifies unlink+add then unlink (incomplete move then deletion) as FileDeletion', () => {
      const old /*: Metadata */ = builders.metafile().path('src').ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlink', path: 'src', old},
        {type: 'add', path: 'dst1', stats, wip: true}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([])
      should(pendingChanges).deepEqual([{
        sideName,
        type: 'FileMove',
        path: 'dst1',
        ino: 1,
        stats,
        old,
        wip: true
      }])

      const nextEvents /*: LocalEvent[] */ = [
        {type: 'unlink', path: 'dst1'}
      ]
      should(analysis(nextEvents, pendingChanges)).deepEqual([{
        sideName,
        type: 'FileDeletion',
        ino: 1,
        path: 'src',
        old
      }])
      should(pendingChanges).deepEqual([])
    })

    it('identifies add({path: FOO, stats: {ino}, old: {path: foo, ino}}) as offline FileMove(foo, FOO)', () => {
      const ino = 123
      const stats = {ino}
      const md5sum = 'badbeef'
      const old = {path: 'foo', ino}
      const events /*: LocalEvent[] */ = [
        {type: 'add', path: 'FOO', md5sum, stats, old}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'FileMove',
        path: 'FOO',
        md5sum,
        ino,
        stats,
        old
      }])
      should(pendingChanges).deepEqual([])
    })

    it('ignores a file added+deleted (e.g. temporary file)', () => {
      const path = 'whatever'
      const ino = 532806
      const stats = {ino}
      const events /*: LocalEvent[] */ = [
        {type: 'add', path, stats, old: null, wip: true},
        {type: 'unlink', path, old: null}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      const changes = analysis(events, pendingChanges)
      should({changes, pendingChanges}).deepEqual({
        changes: [
          {
            sideName,
            type: 'Ignored',
            path,
            ino,
            stats
          }
        ],
        pendingChanges: []
      })
    })
  })

  describe('directory changes', () => {
    it('does not mistakenly identifies a partial dir addition + another on same inode as identical renaming', () => {
      const partiallyAddedPath = 'partially-added-dir'
      const newAddedPath = 'new-added-dir'
      const ino = 123
      const events /*: LocalEvent[] */ = [
        {type: 'addDir', path: partiallyAddedPath, stats: {ino}, old: null, wip: true},
        // In real life, it should not happen so often that two addDir events
        // follow without an intermediate unlinkDir one.
        // But lets assume it happens in order to reproduce this issue.
        {type: 'addDir', path: newAddedPath, stats: {ino}, old: null} // not wip because dir still exists
      ]
      const pendingChanges /*: LocalChange[] */ = []

      const changes = analysis(events, pendingChanges)

      should({changes, pendingChanges}).deepEqual({
        changes: [
          {
            sideName,
            type: 'DirAddition',
            path: newAddedPath,
            stats: {ino},
            ino
          }
        ],
        pendingChanges: [
          // In real life, a dir addition+move analysis would identify only the
          // addition of the destination.
          // Here, since both addDir events have the same inode, first one is overridden.
          // So no pending change in the end.
        ]
      })
    })

    it('handles unlinkDir+addDir', () => {
      const old /*: Metadata */ = builders.metadir().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlinkDir', path: 'src', old},
        {type: 'addDir', path: 'dst', stats}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'DirMove',
        path: 'dst',
        ino: 1,
        stats,
        old
      }])
      should(pendingChanges).deepEqual([])
    })

    it('identifies a DirMove + an incomplete DirMove as an incomplete DirMove', () => {
      const old /*: Metadata */ = builders.metadir().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlinkDir', path: 'src', old},
        {type: 'addDir', path: 'dst1', stats},
        // dropped: {type: 'unlinkDir', path: 'dst1', old},
        {type: 'addDir', path: 'dst2', stats, wip: true}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([])
      should(pendingChanges).deepEqual([{
        sideName,
        type: 'DirMove',
        path: 'dst2',
        wip: true,
        ino: 1,
        stats,
        old
      }])
    })

    it('identifies an incomplete DirMove + a complete DirMove as a complete DirMove', () => {
      const old /*: Metadata */ = builders.metadir().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlinkDir', path: 'src', old},
        {type: 'addDir', path: 'dst1', stats, wip: true},
        // dropped: {type: 'unlinkDir', path: 'dst1', old},
        {type: 'addDir', path: 'dst2', stats}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'DirMove',
        path: 'dst2',
        ino: 1,
        stats,
        old
      }])
      should(pendingChanges).deepEqual([])
    })

    it('handles unlinkDir(x,old=X)+addDir(X,old=X) (identical renaming loopback) as DirAddition(X) because we lack an x doc to build DirMove(x → X)', () => {
      const ino = 1
      const oldPath = 'x'
      const newPath = 'X'
      const old /*: Metadata */ = builders.metadir().path(newPath).ino(ino).build()
      const stats = {ino}
      const events /*: LocalEvent[] */ = [
        {type: 'unlinkDir', path: oldPath, old},
        {type: 'addDir', path: newPath, stats, old}
      ]
      const pendingChanges = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'DirAddition',
        path: newPath,
        ino,
        stats,
        old
      }])
    })

    it('handles addDir', () => {
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'addDir', path: 'foo', stats}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'DirAddition',
        path: 'foo',
        ino: 1,
        stats
      }])
      should(pendingChanges).deepEqual([])
    })

    it('handles addDir+unlinkDir', () => {
      const old /*: Metadata */ = builders.metadir().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'addDir', path: 'dst', stats},
        {type: 'unlinkDir', path: 'src', old}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'DirMove',
        path: 'dst',
        ino: 1,
        stats,
        old
      }])
      should(pendingChanges).deepEqual([])
    })

    it('identifies 2 successive addDir on same path/ino but different stats as DirAddition(foo/) with the last stats', () => {
      const path = 'foo'
      const ino = 1
      const old /*: Metadata */ = builders.metadir().path(path).ino(ino).build()
      const stats1 = {ino, size: 64}
      const stats2 = {ino, size: 1312}
      const events /*: LocalEvent[] */ = [
        {type: 'addDir', path, stats: stats1, old},
        {type: 'addDir', path, stats: stats2, old}
      ]
      const pendingChanges = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'DirAddition',
        path,
        ino,
        stats: stats2,
        old
      }])
    })

    it('identifies addDir({path: foo, ino: 1}) + addDir({path: FOO, ino: 1}) as DirMove(foo, FOO)', () => {
      const old /*: Metadata */ = builders.metadir().path('foo').ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'addDir', path: 'foo', stats, old},
        {type: 'addDir', path: 'FOO', stats, old}
      ]
      const pendingChanges = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'DirMove',
        path: 'FOO',
        ino: 1,
        stats,
        old
      }])
    })

    it('identifies addDir({path: FOO, stats: {ino}, old: {path: foo, ino}}) as offline DirMove(foo, FOO)', () => {
      const ino = 456
      const stats = {ino}
      const old = {path: 'foo', ino}
      const events /*: LocalEvent[] */ = [
        {type: 'addDir', path: 'FOO', stats, old}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([{
        sideName,
        type: 'DirMove',
        path: 'FOO',
        ino,
        stats,
        old
      }])
      should(pendingChanges).deepEqual([])
    })
  })

  describe('miscellaneous changes', () => {
    it('handles chokidar mistakes', () => {
      const old /*: Metadata */ = builders.metafile().ino(1).build()
      const stats = {ino: 1}
      const events /*: LocalEvent[] */ = [
        {type: 'unlinkDir', path: 'src', old},
        {type: 'add', path: 'dst', stats, md5sum: 'yolo'}
      ]
      const pendingChanges /*: LocalChange[] */ = []
      should(analysis(events, pendingChanges)).deepEqual([
        {
          sideName,
          type: 'FileMove',
          md5sum: 'yolo',
          path: 'dst',
          ino: 1,
          stats,
          old
        }
      ])
    })

    it('sort correctly unlink + add + move dir', () => {
      const dirStats = {ino: 1}
      const fileStats = {ino: 2}
      const newFileStats = {ino: 3}

      const oldDirPath = 'root/src/dir'
      const oldFilePath = 'root/src/dir/file.rtf'
      const newDirPath = 'root/dir/file.rtf'
      const newFilePath = 'root/dir/file.rtf'

      const dirMetadata /*: Metadata */ = builders.metadir().path(oldDirPath).ino(dirStats.ino).build()
      const fileMetadata  /*: Metadata */ = builders.metafile().path(oldFilePath).ino(fileStats.ino).build()

      const events /*: LocalEvent[] */ = [
        {type: 'addDir', path: newDirPath, stats: dirStats},
        {type: 'add', path: newFilePath, stats: newFileStats},
        {type: 'unlinkDir', path: oldDirPath, old: dirMetadata},
        {type: 'unlink', path: oldFilePath, old: fileMetadata}
      ]
      const pendingChanges /*: LocalChange[] */ = []

      const changes = analysis(events, pendingChanges)
      changes.map(change => change.type).should.deepEqual([
        'DirMove', 'FileAddition', 'FileDeletion'
      ])
    })

    it('sorts actions', () => {
      const normalizer = (x) => {
        x.path = path.normalize(x.path)
        if (x.old) x.old.path = path.normalize(x.old.path)
        return x
      }

      const dirStats = {ino: 1}
      const subdirStats = {ino: 2}
      const fileStats = {ino: 3}
      const otherFileStats = {ino: 4}
      const otherDirStats = {ino: 5}
      const dirMetadata /*: Metadata */ = normalizer(builders.metadir().path('src').ino(dirStats.ino).build())
      const subdirMetadata /*: Metadata */ = normalizer(builders.metadir().path('src/subdir').ino(subdirStats.ino).build())
      const fileMetadata  /*: Metadata */ = normalizer(builders.metafile().path('src/file').ino(fileStats.ino).build())
      const otherFileMetadata  /*: Metadata */ = normalizer(builders.metafile().path('other-file').ino(otherFileStats.ino).build())
      const otherDirMetadata  /*: Metadata */ = normalizer(builders.metadir().path('other-dir-src').ino(otherDirStats.ino).build())
      const events /*: LocalEvent[] */ = [
        {type: 'unlinkDir', path: 'src/subdir', old: subdirMetadata},
        {type: 'unlinkDir', path: 'src', old: dirMetadata},
        {type: 'addDir', path: 'dst', stats: dirStats},
        {type: 'addDir', path: 'dst/subdir', stats: subdirStats},
        {type: 'unlink', path: 'src/file', old: fileMetadata},
        {type: 'add', path: 'dst/file', stats: fileStats},
        {type: 'change', path: 'other-file', stats: otherFileStats, md5sum: 'yolo', old: otherFileMetadata},
        {type: 'unlinkDir', path: 'other-dir-src', old: otherDirMetadata},
        {type: 'addDir', path: 'other-dir-dst', stats: otherDirStats}
      ].map(normalizer)
      const pendingChanges /*: LocalChange[] */ = []

      should(analysis(events, pendingChanges)).deepEqual([
        {sideName, type: 'FileUpdate', path: 'other-file', stats: otherFileStats, ino: otherFileStats.ino, md5sum: 'yolo', old: otherFileMetadata},
        {sideName, type: 'DirMove', path: 'dst', stats: dirStats, ino: dirStats.ino, old: dirMetadata, wip: undefined},
        {sideName, type: 'DirMove', path: 'other-dir-dst', stats: otherDirStats, ino: otherDirStats.ino, old: otherDirMetadata}
      ])
    })
  })
})
