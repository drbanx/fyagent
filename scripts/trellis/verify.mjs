#!/usr/bin/env node

import { fail } from "../tasks/lib.mjs";
import { verifyRepository } from "./overlay-lib.mjs";

try {
  console.log(JSON.stringify(verifyRepository(), null, 2));
} catch (error) {
  fail(error);
}
