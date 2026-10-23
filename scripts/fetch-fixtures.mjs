// Downloads the official FamilySearch GEDCOM 7 test files into
// tests/fixtures/gedcom70/. They are not committed: their repository
// (FamilySearch/GEDCOM.io) carries no license. Pinned commit + SHA-256.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const COMMIT = '569167b0ce962d98241d415efd472f9611016134';
const BASE = `https://raw.githubusercontent.com/FamilySearch/GEDCOM.io/${COMMIT}/testfiles/gedcom70/`;
const DIR = join(import.meta.dirname, '..', 'tests', 'fixtures', 'gedcom70');

const FILES = {
  'age.ged': '6e05b6978ecd958e3547910928b88300c7acce7bd438c5f4801a026685daf777',
  'escapes.ged':
    'f01b48ad6ee8b90586dd641b85773cb9d6ea5e260ddfb8f77cf5050e6334fe36',
  'extension-record.ged':
    '10fa20739535688fe7deab54ed8cf8b10683411c6a4b1ed3d0b15916acd4481d',
  'extensions.ged':
    '1a3ae5f2602f8cd72efae01af496fca6fc2e471ecae542f6254b666b32178482',
  'filename-1.ged':
    '33c5f090a63b1b6da409afb4ea435e50b9daca2f83ddbf05574c1d208192b7d2',
  'lang.ged':
    '5e5e27adae90ba146fb4f976b9bbdf44de9a876bab89bd46f81549cb3c393768',
  'long-url.ged':
    '91cb27e7bc154d248d761f544cb8da19a75256e9cce4c0b06b70cff4cac6eed0',
  'maximal70-lds.ged':
    'bfd497b95651da440e1524bf8fe08daa0b23e8a3f81d6799954fc1e0c38bb48f',
  'maximal70-memories1.ged':
    '644732ef0f62c106ab844870b2f4cbb56f6603770b86cf8723cf47faed405c27',
  'maximal70-memories2.ged':
    '99f33a277ef9bfd08b09930ec28dfd386939fdf4cc48a7efe4974407fc46eca0',
  'maximal70-tree1.ged':
    '94be2a7640c19f57b1d5fc4d06aa8e18c534a83f7f9eb6ed0d187965dc0a7b66',
  'maximal70-tree2.ged':
    'e825230514e542efe2800a66909409e317e0ed1b52eecdff1cc4c03293b2612a',
  'maximal70.ged':
    'c7af0efc36d2630be965d8c17ecbbcf6b64c6cde9bca3bebed661a06226d43e8',
  'maximal70.gdz':
    '46b0cdc216001c0e65316f60260397d229f809fa3e936aed9ca63806a07aae54',
  'minimal70.ged':
    'c29a542c38668265a2424d962e2f159641252125607c2f9c06ff90b9d99c69f1',
  'minimal70.gdz':
    '09924a0e0bfd426dc80fa6618836772960b2b914174bbb3894f60d09768b412b',
  'notes-1.ged':
    '1b9113ce387698e9e88d8f034ec0cb35b7fdfa504091d47c1b8e4c05049481ca',
  'obje-1.ged':
    '8765570338300e760264d28778a2b25ed2d41932f5646aeb31ca7ef119ec8854',
  'remarriage1.ged':
    'bdee4ef611e5999530bdb9a335bcaa6b676548d56b635432e25a3e3412c98018',
  'remarriage2.ged':
    '68500c3d3debeaf8c56adc4250bbdf5d135658751febd34ba5666cac62f7f32e',
  'same-sex-marriage.ged':
    'd3ef711e2ee0f47ebf0fa8ff52977f9f3063034a124dc32a9fdd293d16e26281',
  'voidptr.ged':
    'ca8f022dcb87d3ddec53b4fb8d6aa7603e5227a20178db6329e062aee9df39f8',
  'warnings70.ged':
    'b8c3a088ee9cb6e4a83c76245019286ee41da1bf0533219c869cc080fc1e8c7a',
  'xref.ged':
    'c194630901c65e13724b47ecd0f11818ac6d4b089757c916506caa08ab8c0870',
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

mkdirSync(DIR, {recursive: true});
let failed = false;
for (const [name, expected] of Object.entries(FILES)) {
  const path = join(DIR, name);
  if (existsSync(path) && sha256(readFileSync(path)) === expected) continue;
  const res = await fetch(BASE + name);
  if (!res.ok) {
    console.error(`${name}: HTTP ${res.status}`);
    failed = true;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = sha256(buf);
  if (actual !== expected) {
    console.error(`${name}: checksum mismatch (${actual})`);
    failed = true;
    continue;
  }
  writeFileSync(path, buf);
  console.log(`${name}: downloaded`);
}
if (failed) process.exit(1);
