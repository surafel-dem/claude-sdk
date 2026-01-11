/ralph-wiggum:ralph-loop
'Monitor the PR for any of the following:

- Inline comments where the change requested has not yet been pushed to the PR.
- Inline comments where the last message in the thread is not a response from Claude.
- CI failures, even if they appear to be unrelated to your changes (if you think that a test might actually be a flake, you can rerun it with the `gh` command line tool).
- Merge conflicts.
- Extra changes in the PR.

If you are waiting on CI, do not waste time running sleep. Run some of the pr-review-toolkit agents to try and improve on your PR, or trace through the tests you are waiting on step-by-step, documenting the flow in your dev log, to make sure that the changes actually fix the test.'

--completion-promise
'All comments have been addressed, all changes addressing those comments have been pushed to the PR, and all CI tests are passing. There are no merge conflicts in my PR, and it contains only changes relevant to the functionality in the PR. I have not taken any shortcuts or faked anything to meet these requirements. The appropriate pr-review-toolkit agents are not requesting any additional changes'
