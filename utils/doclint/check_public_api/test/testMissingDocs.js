/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');
const missingDocs = require('../missingDocs');
const Source = require('../../Source');
const { folio } = require('folio');
const { parseMd } = require('../../../parse_md');

const { test, expect } = folio;

test('missing docs', async ({}) => {
  const api = parseMd(fs.readFileSync(path.join(__dirname, 'test-api.md')).toString());
  const tsSources = [
    await Source.readFile(path.join(__dirname, 'test-api.ts')),
    await Source.readFile(path.join(__dirname, 'test-api-class.ts')),
  ];
  const messages = missingDocs(api, tsSources, path.join(__dirname, 'test-api.ts'));
  const errors = messages.map(message => message.text);
  expect(errors).toEqual([
    'Missing documentation for "Exists.exists2.extra"',
    'Missing documentation for "Exists.exists2.options"',
    'Missing documentation for "Exists.extra"',
    'Missing documentation for "Extra"',
    'Documented "Exists.exists.doesNotExist" not found is sources',
    'Documented "Exists.exists.options" not found is sources',
    'Documented "Exists.doesNotExist" not found is sources',
    'Documented "DoesNotExist" not found in sources',
  ]);
});
