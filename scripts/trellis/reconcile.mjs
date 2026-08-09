#!/usr/bin/env node

import { fail } from "../tasks/lib.mjs";
import { reconcileRepository } from "./overlay-lib.mjs";

try {
  console.log(JSON.stringify(reconcileRepository(), null, 2));
} catch (error) {
  fail(error);
}
