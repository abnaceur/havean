import '../support/env';
import {it,expect} from 'vitest';
import {validatePropertyModel} from '../../apps/api/src/inventory/property-model';
import {uploadedModelFixture} from '../support/uploaded-model-fixture';
it('accepts an authored self-contained GLB plan',async()=>{await expect(validatePropertyModel(uploadedModelFixture())).resolves.toBeUndefined();});
it('rejects remote resource references and malformed or oversized plans',async()=>{
 for(const bytes of [uploadedModelFixture(true),Buffer.from('not a model'),Buffer.alloc(33*1024*1024)])await expect(validatePropertyModel(bytes)).rejects.toMatchObject({response:{code:'INVALID_PROPERTY_MODEL'}});
});
it('rejects invalid accessor ranges through the real GLB validator',async()=>{
 const body=uploadedModelFixture(),invalid=Buffer.from(body);const offset=invalid.indexOf('"count":3');invalid[offset+8]='9'.charCodeAt(0);await expect(validatePropertyModel(invalid)).rejects.toMatchObject({response:{code:'INVALID_PROPERTY_MODEL'}});
});
