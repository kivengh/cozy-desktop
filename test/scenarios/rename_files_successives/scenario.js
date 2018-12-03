/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'file1/'},
    {ino: 2, path: 'file2/'},
    {ino: 3, path: 'file3/'}
  ],
  actions: [
    {type: 'mv', src: 'file3', dst: 'file4'},
    {type: 'mv', src: 'file2', dst: 'file3'},
    {type: 'mv', src: 'file1', dst: 'file2'}
  ],
  expected: {
    tree: [
      'file2/',
      'file3/',
      'file4/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
