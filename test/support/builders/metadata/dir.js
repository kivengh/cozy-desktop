// @flow

const metadata = require('../../../../core/metadata')
const {
  assignId,
  ensureValidPath
} = metadata

const BaseMetadataBuilder = require('./base')

/*::
import type { Metadata } from '../../../../core/metadata'
import type Pouch from '../../../../core/pouch'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

module.exports = class DirMetadataBuilder extends BaseMetadataBuilder {
  constructor (pouch /*: ?Pouch */, old /*: ?Metadata */) {
    super(pouch, old)
    this.doc.docType = 'folder'
  }

  fromRemote (remoteDoc /*: RemoteDoc */) /*: this */ {
    this.doc = metadata.fromRemoteDoc(remoteDoc)
    ensureValidPath(this.doc)
    assignId(this.doc)
    return this
  }
}
