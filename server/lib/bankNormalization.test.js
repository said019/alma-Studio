import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function digitsOnly('), source.indexOf('async function getConfiguredBankInfo('));
function normalize(raw) {
  const context = vm.createContext({ raw, console, DEFAULT_BANK_INFO: { bank: 'Banco anterior', clabe: '123456789012345678', account_holder: 'Titular anterior', account_number: '1234567890' } });
  return vm.runInContext(`${functions}\nnormalizeBankInfo(raw)`, context);
}
test('banco confirmado nunca se mezcla con titular y cuenta de una configuración anterior', () => {
  const value = normalize({ bank: 'Mercado Pago', clabe: '722969020124160665', account_holder: '', account_number: '' });
  assert.equal(value.bank, 'Mercado Pago');
  assert.equal(value.clabe.replace(/\s/g, ''), '722969020124160665');
  assert.equal(value.account_holder, '');
  assert.equal(value.account_number, '');
});
test('sin configuración válida conserva el fallback completo del entorno', () => {
  const value = normalize(null);
  assert.equal(value.bank, 'Banco anterior');
  assert.equal(value.account_holder, 'Titular anterior');
  assert.equal(value.clabe.replace(/\s/g, ''), '123456789012345678');
});
