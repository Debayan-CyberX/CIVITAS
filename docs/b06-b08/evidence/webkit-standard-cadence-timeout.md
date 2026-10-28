# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: living-city.spec.ts >> presentation cadence at 30, 60 and 120 callbacks per second cannot change a run
- Location: tests\e2e\living-city.spec.ts:337:1

# Error details

```
Test timeout of 90000ms exceeded.
```

# Page snapshot

```yaml
- main [ref=e3]:
    - generic [ref=e4]:
        - link [ref=e5]:
            - /url: /
            - generic [aria-hidden] [ref=e6]: C
            - heading "CIVITAS" [level=1] [ref=e7]
        - generic [ref=e8]: THE LIVING CITY
        - generic [ref=e10]:
            - text: Aster
            - generic [ref=e11]: Fictional city / v1
        - navigation "Workspace" [ref=e12]:
            - button "City" [pressed] [ref=e13] [cursor=pointer]
            - button "Map" [ref=e16] [cursor=pointer]
            - button "Laboratory" [pressed] [ref=e19] [cursor=pointer]
        - generic [ref=e22]: Local engine
        - button "Export run" [ref=e24] [cursor=pointer]:
            - text: Export run
            - generic [aria-hidden] [ref=e25]: ↗
    - region "City workspace" [ref=e26]:
        - generic "3D city viewport. Space to play or pause, period to step. Explore entities in Laboratory." [ref=e27]
        - generic [ref=e31]:
            - generic [ref=e33]: ARCHITECTURAL VIEW
            - generic [ref=e34]: LOCAL METRIC FRAME · PERSPECTIVE
        - generic [ref=e36]: 'N'
        - generic "Viewport navigation" [ref=e40]:
            - button "Zoom in" [ref=e41] [cursor=pointer]: +
            - button "Zoom out" [ref=e42] [cursor=pointer]: −
            - button "Pan north" [ref=e43] [cursor=pointer]: ↑
            - button "Pan south" [ref=e44] [cursor=pointer]: ↓
            - button "Pan west" [ref=e45] [cursor=pointer]: ←
            - button "Pan east" [ref=e46] [cursor=pointer]: →
            - button "Reset camera" [ref=e47] [cursor=pointer]: ⌂
        - complementary "Simulation laboratory" [ref=e48]:
            - generic [ref=e49]:
                - generic [ref=e50]: THE SIMULATION LAB
                - button "Close laboratory" [ref=e51] [cursor=pointer]: ×
            - generic [ref=e52]:
                - generic "Laboratory views" [ref=e53]:
                    - button "Explore" [pressed] [ref=e54] [cursor=pointer]
                    - button "Evidence" [ref=e55] [cursor=pointer]
                    - button "Events" [ref=e56] [cursor=pointer]
                    - button "Experiment" [ref=e57] [cursor=pointer]
                    - button "Display" [ref=e58] [cursor=pointer]
                - generic [ref=e59]:
                    - text: Find an entity
                    - searchbox "Find an entity" [ref=e60]: R:J11:J21
                - paragraph [ref=e61]: All scene selections have a keyboard equivalent here. Decorative buildings are excluded.
                - button "Road J11 ↔ J21" [ref=e63] [cursor=pointer]:
                    - generic [ref=e64]:
                        - generic [ref=e65]: Road
                        - text: J11 ↔ J21
                    - generic [aria-hidden] [ref=e66]: ↗
        - complementary "Entity inspector" [ref=e67]:
            - generic [ref=e68]:
                - generic [ref=e69]: Street / intervention
                - button "Close inspector" [ref=e70] [cursor=pointer]: ×
            - heading "R:J11:J21" [level=2] [ref=e71]
            - paragraph [ref=e72]: Directional entry control. Existing occupants and reservations drain naturally.
            - button "Focus in city" [ref=e73] [cursor=pointer]:
                - text: Focus in city
                - generic [aria-hidden] [ref=e74]: ↗
            - generic [ref=e75]:
                - generic [ref=e76]:
                    - heading "J11 → J21" [level=3] [ref=e77]
                    - paragraph [ref=e78]: Closed to new entry · empty
                    - paragraph [ref=e79]: 0 on lane · 0 queued
                    - button "Reopen J11 → J21" [ref=e80] [cursor=pointer]
                - generic [ref=e81]:
                    - heading "J21 → J11" [level=3] [ref=e82]
                    - paragraph [ref=e83]: Open to entry
                    - paragraph [ref=e84]: 0 on lane · 0 queued
                    - button "Close J21 → J11" [ref=e85] [cursor=pointer]
                - generic [ref=e86]:
                    - button "Close both" [ref=e87] [cursor=pointer]
                    - button "Open both" [ref=e88] [cursor=pointer]
                - generic [ref=e89]: Closures affect new entry. Lane counts exclude bodies whose fronts have reached a connector. Prior reservations can still enter.
            - generic [ref=e90]: Authoritative observation · tick 4
        - generic [ref=e91]:
            - generic [ref=e92]: Live signal
            - generic [ref=e94]: Measured queue
            - generic [ref=e96]: Closed entry
    - generic [ref=e98]:
        - generic "Network measurements" [ref=e99]:
            - group [ref=e100]:
                - generic "In network 1vehicles" [ref=e101] [cursor=pointer]:
                    - generic [ref=e102]: In network
                    - strong [ref=e103]: 1vehicles
            - group [ref=e104]:
                - generic "Mean network speed —km/h" [ref=e105] [cursor=pointer]:
                    - generic [ref=e106]: Mean network speed
                    - strong [ref=e107]: —km/h
            - group [ref=e108]:
                - generic "Completed throughput 0veh/h" [ref=e109] [cursor=pointer]:
                    - generic [ref=e110]: Completed throughput
                    - strong [ref=e111]: 0veh/h
            - group [ref=e112]:
                - generic "Unfinished requests 1requests" [ref=e113] [cursor=pointer]:
                    - generic [ref=e114]: Unfinished requests
                    - strong [ref=e115]: 1requests
        - generic [ref=e116]:
            - generic [ref=e117]:
                - button "Play simulation" [ref=e118] [cursor=pointer]:
                    - generic [aria-hidden] [ref=e119]: ▶
                    - text: Play
                - button "Step one tick" [ref=e120] [cursor=pointer]:
                    - text: Step
                    - generic [aria-hidden] [ref=e121]: ›|
                - button "Reset experiment" [ref=e122] [cursor=pointer]
            - generic [ref=e125]:
                - strong [ref=e126]: 00:00.4
                - generic [ref=e127]: Paused · exact snapshot · tick 4
            - generic "Elapsed 00:00.4 of 15 simulated minutes" [ref=e128]:
                - generic [ref=e129]: 00:00
                - generic [ref=e132]: 15:00
            - generic [ref=e133]:
                - text: Speed
                - combobox "Simulation speed" [ref=e134]:
                    - option "0.25×"
                    - option "1×" [selected]
                    - option "2×"
                    - option "4×"
        - generic [ref=e135]:
            - paragraph [ref=e136]: Paused · tick 4 · 1×
            - generic [ref=e138]: 0 source queued (t4) · 0 not admitted (t4)
        - generic [ref=e139]: Paused · tick 4 · 1×
```
