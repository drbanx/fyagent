# Polish GitHub repository branding and community

## Goal

Turn the existing FyAgent repository into a clear product and community entry
point without changing the shipped application identity. A first-time visitor
should understand FyAgent as a personal control center for AI Workers and
Agents, see the portable-digital-persona vision without confusing it with
current capability, reach the current Release or manual, and choose the correct
support or contribution channel from the first README viewport.

The user approved `For You Gate` for the public GitHub surface only. The
approved application master `assets/fyagent.png` and all application, bundle,
tray, installer, and About consumers remain unchanged.

## Requirements

### R1. Brand boundary

- Use the deterministic `For You Gate` SVG and locked graphite, signal-blue,
  clear-cyan, warm-white, and safety-amber tokens from the 2026-08-11 brand
  review package.
- Keep the repository-facing symbol under `assets/brand/github/`; do not run
  application icon generation or modify application brand consumers.
- Keep concept art separate from runtime evidence. Do not add generated or
  mock UI as a product screenshot.

### R2. GitHub-ready assets

- Provide one accessible reusable symbol SVG.
- Provide an editable 1280x640 social-preview SVG and a rendered PNG below
  1 MiB with a solid graphite background.
- Remove review-only wording, fake buttons, third-party marks, and embedded
  version numbers from public assets.
- Use deterministic text and geometry; do not redraw the symbol with a
  generative model.

### R3. Multilingual repository entry

- Keep Chinese, English, and Japanese README files and the current language
  switching model.
- Give all three the same information hierarchy: brand, one-sentence value,
  high-signal status badges, Download / Documentation / Discussions /
  Contributing links, capabilities, shortest start, help routing, development,
  history, and licensing.
- Keep prose natural in each language rather than literal translation.
- Put the human-facing language first: AI brain, tool connections, skills,
  working instructions, and future memory. Keep Provider/MCP/Prompt as precise
  secondary terms rather than the brand proposition.
- Align the package, Flatpak, application About description, and user-manual
  introduction with the same personal AI control-center category.
- Present "a portable digital persona for the AI era" and "the steering wheel
  for your AI" as vision and mission; explicitly separate them from the
  current, verified configuration-management feature set.
- Preserve current capability, release, signing, provenance, and licensing
  boundaries; do not call the PolyForm-licensed repository open source.

### R4. Community routing

- Add Discussion category forms for the existing `q-a`, `ideas`, and
  `show-and-tell` slugs using only labels that already exist.
- Clearly route questions and early ideas to Discussions, reproducible bugs to
  Issue Forms, accepted work to Issues/Projects, and code changes to Pull
  Requests.
- Repair the bug form's mandatory FAQ link so it resolves in every active
  README language.
- Prepare seed content and operating guidance for welcome, roadmap, install
  help, and setup showcase discussions; public creation happens only after the
  target repository/category IDs are read back.

### R5. Organization surface

- Produce a ready-to-copy organization profile README draft under maintained
  marketing documentation.
- Do not create the separate `fy-agent/.github` repository in this task.

### R6. GitHub metadata and publication

- Set a concise repository description, a useful homepage link, and no more
  than 20 accurate lowercase topics.
- Upload the approved social-preview PNG through the authenticated GitHub UI
  if the connection supports verified readback.
- Preserve repository governance. Publish code changes through a dedicated
  branch and pull request; do not bypass required review or checks.

## Acceptance Criteria

- [ ] AC1: `assets/fyagent.png` and every application-brand consumer are
      byte-identical to `origin/main`.
- [ ] AC2: the symbol and social-preview SVGs parse; the PNG is exactly
      1280x640, decodes successfully, uses a solid background, and is below
      1 MiB.
- [ ] AC3: the three README files share the approved entry hierarchy, have no
      broken local links, and contain no fake runtime evidence.
- [ ] AC4: Q&A, Ideas, and Show-and-tell Discussion forms match current slugs,
      parse as YAML, and use valid existing labels.
- [ ] AC5: all mandatory Issue-form FAQ links resolve to an existing heading.
- [ ] AC6: the organization profile draft is complete and explicitly remains
      a draft for the separate organization repository.
- [ ] AC7: focused docs/contracts checks and `git diff --check` pass from fresh
      command output.
- [ ] AC8: GitHub API readback confirms description, homepage, and topics; any
      UI-only social-preview or category action has visible post-write
      readback or remains explicitly unclaimed.
- [ ] AC9: the implementation is committed on
      `codex/github-brand-community-polish` and published through the normal PR
      governance path.

## Out of Scope

- Replacing the application icon or running `assets:icons`.
- Product UI or runtime code changes.
- Fabricating or publishing an unverified product screenshot.
- Formal trademark clearance or native Windows/macOS icon acceptance.
- Creating or publishing a new organization `.github` repository.
