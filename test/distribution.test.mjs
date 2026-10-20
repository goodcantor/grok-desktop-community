import test from 'node:test';import assert from 'node:assert/strict';import {distributionPolicy} from '../electron/distribution.mjs';
test('only an explicitly signed packaged distribution enables in-app installation',()=>{
 for(const value of [null,undefined,'','unsigned-preview','unknown'])assert.equal(distributionPolicy(value).updates,'manual');
 assert.deepEqual(distributionPolicy('signed'),{channel:'signed',updates:'verified'});
 assert.deepEqual(distributionPolicy('signed',false),{channel:'development',updates:'manual'});
});
