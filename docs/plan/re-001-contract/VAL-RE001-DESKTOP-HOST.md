# VAL-RE001-DESKTOP-HOST: Candidate works in the actual ChatGPT controlled browser

Surface: browser.
Needs: owner access to ChatGPT Desktop, reviewed candidate build served on an approved secure origin, and genuine WebMCP runtime.
Behavior: The controlled browser opens the candidate reader, discovers Bookhand WebMCP tools, navigates across chapters and back to the exact source, reveals and resets a remaster, performs Tutor focus/Back/Stop, and reloads to the confirmed reading position while the ADR 0005 frame identity remains stable.
Evidence: Desktop-controlled browser transcript/trace, visible screenshots, tool discovery and results, frame identity/URL diagnostics, network/console observations, exact build commit and asset hashes.
Fail: Ordinary Playwright substitutes for the controlled browser, a stub substitutes for `document.modelContext`, or the tested build cannot be tied to the reviewed candidate commit.
Oracle: Actual ChatGPT Desktop browser surface.
