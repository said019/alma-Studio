import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRegistration} from './registrationValidation.js';
const good={displayName:'QA Cliente',email:'qa@example.invalid',password:'Testing123',phone:'+525512345678',gender:'other',dateOfBirth:'2000-02-29',acceptsTerms:true};
test('registration validates matching UI and preserves international numbers',()=>{
 assert.equal(validateRegistration(good).data.phone,'+525512345678');
 assert.equal(validateRegistration({...good,phone:'+14155552671'}).data.phone,'+14155552671');
 for(const change of [{password:'a'},{password:'abcdefgh1'},{password:'ABCDEFGH'},{phone:'123'},{phone:null},{acceptsTerms:false},{acceptsTerms:'true'},{dateOfBirth:'2001-02-29'},{dateOfBirth:'2000-02-30'},{dateOfBirth:'1899-01-01'},{dateOfBirth:'2999-01-01'},{dateOfBirth:null},{email:123},{displayName:' '},{gender:'invalid'}]) assert.ok(validateRegistration({...good,...change}).message,JSON.stringify(change));
});
