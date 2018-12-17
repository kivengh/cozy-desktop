/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'src/'},
    {ino: 2, path: 'src/file'} // default content 'foo'
  ],
  actions: [
    {type: 'mv', src: 'src', dst: 'dst'},
    {type: 'wait', ms: 1500},
    {type: '>>', path: 'dst/file'} // adds ' blah'
  ],
  expected: {
    tree: [
      'dst/',
      'dst/file'
    ],
    remoteTrash: [],
    contents: {
      'dst/file': 'foo blah'
    }
  }
} /*: Scenario */)
