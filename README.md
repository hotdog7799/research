# Research Notes

Static research notes and password-protected project reports.

## Local encryption workflow

Keep plaintext report drafts outside this repository or in an ignored local folder.
Then encrypt a report with:

```bash
REPORT_PASSWORD='your-password' node scripts/encrypt-report.js \
  /tmp/research-drafts/rotation-axis-geometry.html \
  projects/rotation-axis-calibration/report.enc
```

Commit only the unlock page and `report.enc`, not the plaintext report.
