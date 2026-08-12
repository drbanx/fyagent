# Implementation plan

## Phase A. Baseline and source

- [x] Confirm the independent worktree is based on `origin/main` and the task
      branch is recorded.
- [x] Record application-brand consumer checksums before editing.
- [x] Copy only the approved deterministic For You Gate geometry and visual
      tokens from the user-provided review package.

## Phase B. Repository assets and entry content

- [x] Add the reusable symbol SVG and 1280x640 social-preview SVG.
- [x] Render and inspect the PNG; verify dimensions, mode, background, and
      compressed size.
- [x] Rework Chinese, English, and Japanese READMEs to the shared entry
      hierarchy without introducing runtime claims or evidence.
- [x] Add the FAQ headings required by the Bug form.
- [x] Add the organization profile draft.

## Phase C. Community configuration

- [x] Add `q-a.yml`, `ideas.yml`, and `show-and-tell.yml` Discussion forms.
- [x] Validate form slugs and labels against live repository state.
- [x] Prepare concise welcome, roadmap, install-help, and showcase seed bodies.

## Phase D. Verification

- [x] Parse all new SVG/YAML files and decode the PNG.
- [x] Run the repository's focused docs/link/contract checks selected from the
      canonical mise task catalog.
- [x] Run `git diff --check` and the application-brand exclusion audit.
- [x] Visually inspect the social preview at full and reduced size.

## Phase E. Publish and read back

- [ ] Commit and push the task branch through the normal GitHub publication
      workflow; create a PR targeting `main`.
- [x] Update description, homepage, and topics; read them back through GitHub.
- [ ] If authenticated UI control is available, upload the social preview and
      verify the visible Settings state. Blocked by the browser connector's
      disabled file-URL permission; the local asset is verified, but no live
      upload is claimed.
- [x] Create or update approved Discussion categories and seed posts only
      after exact repository/category IDs are resolved; record public URLs.
- [x] Do not bypass required PR review or checks.
