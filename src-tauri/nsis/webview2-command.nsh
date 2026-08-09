; FyAgent secure WebView2 bootstrapper command.
; Deterministic gzip of UTF-16LE source; verifier checks exact compressed bytes.
!define FYAGENT_WEBVIEW2_COMMAND_CHUNK_COUNT 9
!define FYAGENT_WEBVIEW2_LOADER_BASE64 "dAByAHkAewBmAG8AcgBlAGEAYwBoACgAJABpACAAaQBuACAAMAAuAC4AOAApAHsAJABlACsAPQBbAEUAbgB2AGkAcgBvAG4AbQBlAG4AdABdADoAOgBHAGUAdABFAG4AdgBpAHIAbwBuAG0AZQBuAHQAVgBhAHIAaQBhAGIAbABlACgAIgBGAFkAXwBXAFYAMgBfACQAaQAiACkAfQA7ACQAYwA9AFsAYgB5AHQAZQBbAF0AXQBbAEMAbwBuAHYAZQByAHQAXQA6ADoARgByAG8AbQBCAGEAcwBlADYANABTAHQAcgBpAG4AZwAoACQAZQApADsAJABtAD0AWwBJAE8ALgBNAGUAbQBvAHIAeQBTAHQAcgBlAGEAbQBdADoAOgBuAGUAdwAoACQAYwApADsAJgAoAFsAUwBjAHIAaQBwAHQAQgBsAG8AYwBrAF0AOgA6AEMAcgBlAGEAdABlACgAWwBJAE8ALgBTAHQAcgBlAGEAbQBSAGUAYQBkAGUAcgBdADoAOgBuAGUAdwAoAFsASQBPAC4AQwBvAG0AcAByAGUAcwBzAGkAbwBuAC4ARwBaAGkAcABTAHQAcgBlAGEAbQBdADoAOgBuAGUAdwAoACQAbQAsAFsASQBPAC4AQwBvAG0AcAByAGUAcwBzAGkAbwBuAC4AQwBvAG0AcAByAGUAcwBzAGkAbwBuAE0AbwBkAGUAXQAwACkALABbAFQAZQB4AHQALgBFAG4AYwBvAGQAaQBuAGcAXQA6ADoAVQBuAGkAYwBvAGQAZQApAC4AUgBlAGEAZABUAG8ARQBuAGQAKAApACkAKQB9AGMAYQB0AGMAaAB7AGUAeABpAHQAIAAxAH0ACgA="
!define FYAGENT_WEBVIEW2_COMMAND_00 "H4sIAAAAAAACA9VdeVMbSZb//c2nqKCJkLSNytxXBzEjBIyZNg0Bdns3aM+MkArQWNeoJGx2xt99I1++rDyrSgLh7g2HHVIpM9+RL9+d5RFaGKOFPqpYQoQIN/gVLfTQRQctTJDgGgkmqKKCMwyQYkK/91DBKiJU8CsSjNHFHZ5wgQF6eEIFNXzKVhRzxIgB7vEJKzjHEB0kiHBIK/jrLuXONaFdEoYPWEKNZqwgwQCPOMAlrhnKFD0k2UgJcRkrNOItLnCOE/xmjU2xTGu5azQwxQRDvMMQLXQYp0uMkeCOsBLQ2wZdv2CIARJUsIRzdNHGGEOkGOIOE8S4xBBfaOY1HpAQ9TGaGNJav+EMfYzo2wR1C5cI/2AO1fEL7V8yA12/zYHFOVoYoIV7JLT6AJMXz48xQooO1rFsUXBKNLYduk4wJkhjNNDGBF3iZoRr2oXR/0OeipPUxpTkd4KnF839I/BSaoY6rTKm+RPjbNf5rKYZtHesUcSZFicsjFXRiVL4Vvi8pwbkY3RpRpvGjPGEa3TQQS+bfYEDHKGBY9IQVTTwEy5whibO8BNO6bv4c43/Qa3gd7FGjXCwMThFl6RiFrh58PLgSN0o96NTSuufM30uoQsIi6J6NWflBs5ecfWymWWQn4v381ZfpJTlrfwa/J4F75dyZDH8ljbfPRfhE1h2GuY5i+VStIjV8mbkQZgXr/lWe4nuKpeCRay2OAqfxy/lgf6ACFdI8IguEpbJCBtYwwZ2UMca9ujffUS4"
!define FYAGENT_WEBVIEW2_COMMAND_01 "I9vXR0SeaUJPuvjKc3x7HOEjEtziV157g2Z8IV99gM+IcEs2WpyFmKxtghbuGCux0oTsr7SyKSLy/SXcFp2bOto0P2UchAfXobkJ/oUp2xz5PEKCrxgR9Db5JHKcTXmLzmE3g/pTRq3EqkdP78nW12mtR555iSYaiDDCFLcMpY7PSPBET7uEw4hhSv9S0hShSX7SmJ9+IHrGBHmMKVnsOvFjSFiLlf7JtlRiKXHT+9MniqfEJzFqmkUkihcXOAzumPSVpL/ZMvwu4RPdU2wg8PpCHHowJCHN/M8T/IwPiAO67tpYo0n/TiguElioyO0BLWxgGzsBTdjEEfaxixPs0d9t/rSPTWxgHac4Iqndwg493cYutnCCUxxjHbvYwQ72cYRNHGEN29jDOo6xgS2atYEGmthFE3toYAMbNHsTm/RtC1u5OrzJHqSiT8VZgqprjPAZ3RLKtrFGtAg429jHBslSgz4LnI6J8h2sYxvH2CFadrGJPfr1hKgUf7YJ7x36V2C8hia20CTuiN+OsUZc2KNVxOwdHGPf0Ad3mJIHq3f+L5nPrCl4S2cpwr+ZgpEXlctY+DJ7ntD+jlHlOEvG6tITlPxYYWlPjEhcrnKLJ5p9g08UUR/x95RH1bLoW3i3Lp9vApFIk+COCIN7wnCEB/pFxE0Nnv8JBzigsQnLZ5VgRXwynwwORKxN5FkbENwjgtckPj6yvIt/5brvMcziECEvJud8WmQU0yftIlZ5ixb9Xi3kT81Ys4aYNL3QgC2K"
!define FYAGENT_WEBVIEW2_COMMAND_02 "UUSGpJ5lRSrZ6G+s2Qcs5y6dLmbCt09JZ6QWj75hif6GpMrmiuBFHcf07R1pwXvWL99HwrqkdwXvTOiudAldFaHqjIrIDgjduUafh6Qh/TH3POYrdnFn/ak5/BUzxqRdxL4c4wRXZHnM9bpkO4YkDSnlvhJLG08xyrIGCdvEFluumM672qHZKPuKPax5mLoSb0viny3pdLlbc3BY4dhZ6tJOdnqFpPSI+rbhC8SklwacW2sjxjviycSCKE/agOy7lssveGCvO0yz2qmaJ/c2hjHnAaUMV7FGJ8mEH1r9NvNSBFfl/tcsKPaMw6A0pSQjEfYcLs63I9VsZyVmSnZdOpskaeKM1IgrPwZHiVPcID+mhSfm97cSq3JFnsM1+UzKp7k0PKifyX8SfL4jfWlq9++jG+axHv9Nlnw/x7tJS0ds0CkJ/5avjcLj4wAfY1yQrog5Zz7lvFebzojQNuuIsYEYe+Q9xFjHOjaxjS3s0zf1t1KotZYDMUXI21Q+s/KSBU73tC/Sv+xnmm7Avu8VrtHAAe3Yy2mvUebcPD++NfVxOiOJH2RQpU9s+3QRn+9N1gri8xo6xucd4/N+9nkDrezznjFmC3vOcxvOHXZz4KzP8Hnb+LxmSFqYI7fECdN3OSIt8BTkgqlvXAhSk/gQ5tnVE0sLyad6h4XP08IXHNMarTlo0rT4FGxmuNu0zurV1J3vRTyNgz6J0sH58/IpNfdqdvnOg5cHJ51Rp+fzeZNt8GL5PBtXTR7aNrUoHqob"
!define FYAGENT_WEBVIEW2_COMMAND_03 "vnc0Bw/K7eQFvrC3c0zee8/IGH4fO+jWNXUt043BugSlzyu+tIKnOHCWrVonX09SIqRX10pXjM9mZcm2mFUDxxgNTJiyW46tUsdPu8EZLhBnudrQDOlpyviqRTWkhKjsstckVpQ2dq3EcjbIf1c+RxLMoo0yKrtZDmlswY7I+5fQDyzOLHt+d+r41mLfij0gUf1qE90pn8UJUdAr/O3agSN5piVb+6DfD7o5PnTazZO0KElu0PmdTY6Xsthdzna5cUy4t+n7iM+y0gxS/vsk7+4eF/nmDeJGwhVns1bqQv+9dY/uu3gtaMqaNZxMpuRwKP9k1nFm0d71gn3XPn4YvvLdhW/cZmlvEeaphc0iNc4DZZ5UHnlKdIm8upQv6esPjTMtY8pjyq6+c3RRxLKpsFyeIXNkS6d/JmXXy0PmwbSz+v4fzU6qnHqL9U0yt8X0+zO0jglz4ToA8x8G/rPrJC2bPh0xaQ35PTVsn9DmT8QhaXvDPTeqb6lvVCDiAOYmDKnNdSdYscT78n3L1RW5ey3Knkn5zZen1KKxy2duFo4Ife7b4XYw6lHyFl6zrKLi7tWA+oCk5hA1sny4xVnJeTioNMaAvH27ktTOifTyM5R5M+wckpQ5gY+UojbJcAVV/AkH+Bv+g1X8hhT/hdqctTC5wir+gxWqpC5O0mzO2HmP2fHTuZHZOGVrXZ2L/YwpTvCV5gyMnigpjUqO5Pg77rBqMZ+rtII/V9ZA8zHz4aUef7Uk+BDy8ltS0iuU2dqm"
!define FYAGENT_WEBVIEW2_COMMAND_04 "DJfIZm1iN7B/s9Hvw7ZXuGV+fDaef8uV6dCpzMNgcefSljf7lIqsygNp5zbb9J85R/eBMrb3xNnQDlSCeX1zLbmSuc7hK2ZaT0qg+xy2qwZLM0iFm2VatWbdkSymVg7XleRiHONSKlJP5vO8Qpnj3URMtbt1PhHi7y4/3yzRapWFabUW21aZffpflrQ79hlNS2tW1m0Zc70p5SPZVeB5sjZ52imUSdR7+LJehzI/Pkzba9mePE/E3j23e+agEFffyoielfdcsZSY9UhnDnjvB4znNOsalXGKqgWmRsVT9Li3aQ/O2Qp12edsEw5d7gAS8iN/icm3i8gfU1S3Mj3+Q9YLJLMrd6TLE+5LkvRPSFPm9e6oHhlZo9UUyXFuN5XkrKTtkfnd4X6hYZah+MnAbkJ0TSyM+twtFBGFj4xJwp6qzD2m3Lczzsaq89a1bjWouV9ZK2tPXPurmrOHr1orU3BszWzGYPldGSaesbHWJcmbgPjEnRGPLEOKUvPWh23dX4vSIixUtmzA/XPJQmg8pW6Q+9+ZRoWFpPGEIy1xpjQt81Kr7910g7DS70hzOS6ScnH/Rj2bl94PGKNH3JX5B6lHeniPLsXWSg/Jk6qeXlM2RJ2sU9ZJkgtDynykqHIlxvfB65ktsHE8ot7LHjoFcUgtx/PW65gRc8L79byOEDsnE+4KUX9CsYwb6Q8KdsWO830Ky6gU+Y8Occ7PJZl4uBkFG8q3Ar7qWyyapzYkwZ+/cv2gGsBf9Yytzk1bqEfE"
!define FYAGENT_WEBVIEW2_COMMAND_05 "nO1+L/NobL+lQ9Gf9lBuMzlUu/Z8f+GggIvLgShP8mJEUC5pxnmWidD9TX50EBkWWVaqBqT/v/KMdepJtp+rPq08mTyh09LPuo7Njh5/tR8ZTl5kbK6lqJgN7o0F6RONzc9amf2GeV20i+gjqudg4VNr45Xn+8/fD1ynKlTI7/dH5+uUcllT/pI/O5SvcKX5W4kFyIcfwrksonQjEn0qOxiyPVCwbd7pemh5B5KKMetOjOn2JumY087klHXKmueivE9WS5R5K1Flr/LuLWuYan5In58hxS+cZ7rAGB9J500yH0B2BIfvK9dK8gEhzNxbGKlxw9Je3c8ZPb/GY1fTwnevI45rutznqbiv41FVQR/zzVmz/vSYZVnMGymy0q7wGVoSoWPZVqZ/o6w626K8nx97SXz8+MvN1H3AFd6RPdY3T1KiYkxPe5RlGZAk1gnfe0wzjbaaVejUPdc6+hk35e30LvFhYGjBH2iWjC/H3H0sb3zkZRikd6rulz5QB4W4D3yAN3hD/Ucx+oG6V5v80TfWvaE3GOEN/kT+nfgu+pUO6Y6DuPWwS/1ZlUJsGg4XUqMLqYI3pAt6/Jvydd44e1ThuyBiB7+SNy3WO8qBaGaYBCRxS+UcR7SClLN7rj2q/NIly5a2ssojq1v1U9V/dRLcK3n2pZU8Jb+5Q/ioFaq5M38kvZDQXakWdxOo2epmhNibPs1qEKU9J75RtNTofong4ime0KCMpeTtUubV3ntvPQjROxu3lgPnqW7AqVOF"
!define FYAGENT_WEBVIEW2_COMMAND_06 "5AZ/Ie3UyaIvYSvUsypV6fxbGuItCRXSiMuFMjYLLSHKKwF9d4IOjXKt5DX3qowQs6aQHP3C8avuTDUrNits6zuFv0tLNWBdWD5GcimhXQmNV2f+LVfUe7nQ1cgmyZPtZ5rj2lk+vEdabpJbo1px8mihEcoiNK13fWyQfVjyMkvz9MjML7/13H6P2e/V68x4JzDGxfHwGb1Wx6XrhiPtWTCKWbaf3+80y3sWakb1YOJUo2TPnz9XxRBuLtI/y6HVY+c+2Sy8qL1Y5kJ6ZrEydpfdY1+EZJ3mrJYnT3nQFylF7k19Dd3Xtm7HqKkb86uLZZZk1eozsiHYWWJTxqRVW31BT6WmQvfuXFG09EDYSpgfMy4U4Skj2XGGqXrjkDlnB9vYxqZzy8Fd6YJ2zu7m1Di85/hkSli69diwtLgdWjeUp5b+wQ1lVu+crGOcnck+ed5KQtUbl8z9rTi9T7+QZMZ4y9ZOeJn2+2cOsYWYbuHIv6tcbeplHUCHxLspy0uPRvhZD+HDfCbbcohb8o7vsE03Ru7ofk+HstQtbKKVRWL69ofC85pwe6R1zd5ms4dLeYYuZy/5Nv+Q/Pme12H8OjBC3cQmpKLZ7ynnn2R3dUWGTsQX6swXeTM33t7qT6ZPY8/N021hSLGhvVW/3BVpa62rw1mf/BXPKZJxu+/a3rpmn3iEbW9d32+blSOuTQ1juur0XxbBj59V/zgnuVO9/VVsGFCKvc4b1jyJ8cY1YfPDc/TJvCb85G2FPAvxfKw1"
!define FYAGENT_WEBVIEW2_COMMAND_07 "9nmefZh3Mm4UOu6J8J/NXslYfzV47kL7L++192iE5Iup2/XNChPvt0YEk9KvLbr1ZufewlyPDb67/fUNfKF8ner/1b9IDKT2rRr6UdsIn7uybyfN+lWnhpU1ayMq5qh6vUEmPaEuMR/iFWfdZDbnnKEp37buaMRFrOr++oG0agjWItYVulvmlfvO7dUbHiElRn42x77Nsk76vtdiepzGnuaVlApL8pj1xNt39d/iPd7Tm/pCPXMqoy1PYuhGuM/LpjUnds6I+7t//61M5gZcEynCrc6aWq9RLZ3R43tR5tsTimfcc8Vh3txbbeE7b/PUvW9Y/JYGO8oqfkPDbPmWcplQmrLBGkitYOr452nDpcwqTOmtBqY/ZN8NNa2b9vW1RlXvWPpEVn7IWTw3g7oWfJtD1dM3LaP+VcRDmze+vfOpc6vfa94Te7x953Q1UKGf1V69zGbVSt5yEeb5jwYPW9YJ11Wr8MyXnNf564b5Z1Vk+AR3k+wNI+ok2nhFgRtNKfenhuuAfh4gNmLRqic3EUdzmpu13N7wPJ5KW722QF3W4XtbPY5eI5Ir2ZfYJ4/sKaiZbLpPqTom300U8tLt0Xk10bIc9svyYeU5+9mzY25eyOxu9bMeWsuE3gU3tt7PpHsspFXskx0xIw5T94Vuk42MDrHIssw/eL2l4Vqjql1O2dvy3/dmvgPwNpPQ2LJbdq3h986OXdDMQeEMMx+mIxA3xijLbl1ZurK24Op2GUfs7LOAZr9z4YZOX4ukZkij"
!define FYAGENT_WEBVIEW2_COMMAND_08 "BKyUbhuaknHtzc/LVfiQNG/0G6oPX4h9nFu/na/iW8c/OcMkNGWUabYwzA/sMajblyfGaUlyu7nCa9n52SE+cleU1NrhrE2ogjXrDubtl71mHNhpffvQ/WWpoA8ob9VqaSfJPPbK5Yjb/adxDlktF8uP7EPJ/P8JVwNNboUrhP5KJ864JeoTahv3EP+d+bpN1q/y7oPqf1adhaYX8Y77EE2tuGxYuvC97Xzu2RVy06qot6vqOx3Ckv+dKWuTjdK+qR2z69uENaY7rz8qfPtNxZim1fA9VPPX4r6qckimn+FDms1b+TYzTXnRR5jG/FhlsZiUQ38pxFB+0YcazkK+DHJeVFUL9OrlxV/Pw0Bl08J58Xr2fplijtm573yeudn8l3HN1mk+VFfnlUF76btTruib7Dkz3wU067sLyj1+e6XQ/0pR9j9T6J4xoelU5kXm5JM/CB9CnQCvT7nsr9Q9l74tXcL/AZJWWF3aZwAA"

!macro FyAgentSetWebView2CommandEnvironment
  StrCpy $7 1
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_0", w "${FYAGENT_WEBVIEW2_COMMAND_00}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_1", w "${FYAGENT_WEBVIEW2_COMMAND_01}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_2", w "${FYAGENT_WEBVIEW2_COMMAND_02}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_3", w "${FYAGENT_WEBVIEW2_COMMAND_03}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_4", w "${FYAGENT_WEBVIEW2_COMMAND_04}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_5", w "${FYAGENT_WEBVIEW2_COMMAND_05}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_6", w "${FYAGENT_WEBVIEW2_COMMAND_06}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_7", w "${FYAGENT_WEBVIEW2_COMMAND_07}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_8", w "${FYAGENT_WEBVIEW2_COMMAND_08}") i .r0'
  ${If} $0 == 0
    StrCpy $7 0
  ${EndIf}
!macroend

!macro FyAgentClearWebView2CommandEnvironment
  StrCpy $6 1
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_0", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_1", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_2", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_3", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_4", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_5", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_6", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_7", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_8", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
!macroend
