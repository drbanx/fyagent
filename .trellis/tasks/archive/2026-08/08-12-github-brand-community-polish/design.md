# GitHub brand and community design

## 1. Visual direction

Primary archetype: **Personal AI Product / Desktop Utility**.

The repository surface uses one strong symbol, precise humanist typography, a
dark graphite field, and restrained blue/cyan signal color. It does not use a badge
wall, fake dashboard, purple SaaS gradient, glass-card grid, or decorative 3D
render as product evidence.

Locked tokens:

```text
graphite      #0B0D10
surface       #151920
warm white    #F5F2EC
muted text    #A9B0BB
signal blue   #0B66FF
clear cyan    #18D3C5
safety amber  #FFAA2B (status only)
```

## 2. Asset model

```text
brand review package
  -> assets/brand/github/for-you-gate.svg
  -> assets/brand/github/fyagent-social-preview.svg
  -> deterministic raster render
  -> assets/brand/github/fyagent-social-preview.png
```

The README references the reusable symbol rather than the application icon.
The social preview uses the same symbol and tokens, but is a channel-specific
composition rather than an automatic crop. The PNG is the GitHub upload
artifact; the SVG is the editable source of truth for that channel.

## 3. README information architecture

```text
symbol + product name
"Own your AI" one-sentence value
language switch
release / CI / platform / license badges
Download · Documentation · Discussions · Contributing
personal AI control-center definition
portable digital persona vision + human control mission
current verified capabilities in human language
download and shortest start
help routing
development
history and licensing
```

The three languages share this ordering while retaining natural local prose.
The origin story remains, but it moves below the task-oriented entry content.
Vision language never turns future memory or a complete digital persona into a
current product claim.

## 4. Community model

```text
question -> Q&A Discussion -> marked answer
early idea -> Ideas Discussion -> accepted scope -> Issue / Project
reproducible defect -> Bug Issue Form
working change -> Pull Request
release/update -> Announcement Discussion
setup/workflow -> Show and tell
```

Discussion forms gather only information needed for useful replies. They do
not duplicate the full Bug form. Labels are selected from the existing shared
repository label set so form submission never silently drops a missing label.

## 5. Publication and rollback

- Repository file changes ship through a dedicated PR.
- Metadata and Discussions are repository-level writes and require API or UI
  readback after mutation.
- The separate organization profile remains a draft file in this repository.
- Rollback is independent: revert the PR for file content; restore previous
  metadata/topics and remove or edit public discussions through GitHub.
- Application brand consumers are excluded mechanically by diff and checksum.
