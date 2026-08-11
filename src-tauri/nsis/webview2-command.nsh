; FyAgent secure WebView2 bootstrapper command.
; Deterministic gzip of UTF-16LE source; verifier checks exact compressed bytes.
!define FYAGENT_WEBVIEW2_COMMAND_CHUNK_COUNT 10
!define FYAGENT_WEBVIEW2_LOADER_BASE64 "dAByAHkAewBmAG8AcgBlAGEAYwBoACgAJABpACAAaQBuACAAMAAuAC4AOQApAHsAJABlACsAPQBbAEUAbgB2AGkAcgBvAG4AbQBlAG4AdABdADoAOgBHAGUAdABFAG4AdgBpAHIAbwBuAG0AZQBuAHQAVgBhAHIAaQBhAGIAbABlACgAIgBGAFkAXwBXAFYAMgBfACQAaQAiACkAfQA7ACQAYwA9AFsAYgB5AHQAZQBbAF0AXQBbAEMAbwBuAHYAZQByAHQAXQA6ADoARgByAG8AbQBCAGEAcwBlADYANABTAHQAcgBpAG4AZwAoACQAZQApADsAJABtAD0AWwBJAE8ALgBNAGUAbQBvAHIAeQBTAHQAcgBlAGEAbQBdADoAOgBuAGUAdwAoACQAYwApADsAJgAoAFsAUwBjAHIAaQBwAHQAQgBsAG8AYwBrAF0AOgA6AEMAcgBlAGEAdABlACgAWwBJAE8ALgBTAHQAcgBlAGEAbQBSAGUAYQBkAGUAcgBdADoAOgBuAGUAdwAoAFsASQBPAC4AQwBvAG0AcAByAGUAcwBzAGkAbwBuAC4ARwBaAGkAcABTAHQAcgBlAGEAbQBdADoAOgBuAGUAdwAoACQAbQAsAFsASQBPAC4AQwBvAG0AcAByAGUAcwBzAGkAbwBuAC4AQwBvAG0AcAByAGUAcwBzAGkAbwBuAE0AbwBkAGUAXQAwACkALABbAFQAZQB4AHQALgBFAG4AYwBvAGQAaQBuAGcAXQA6ADoAVQBuAGkAYwBvAGQAZQApAC4AUgBlAGEAZABUAG8ARQBuAGQAKAApACkAKQB9AGMAYQB0AGMAaAB7AGUAeABpAHQAIAAxAH0ACgA="
!define FYAGENT_WEBVIEW2_COMMAND_00 "H4sIAAAAAAAC/9VdeVMbSZb//c2nqKCZQNpGZQ5zGAcxI64x26YhwO7eCeyZFlIBGgtJq5Kw2Rl/9418+bLyrpJAdveEww5JlZnvyJfvzvIQLYzQwj1qWECCBFf4BS300EUHLYyR4RIZxqhhGSfoI8eYnvewjBUkWMYvyDBCFzd4xBn66OERy6jjY7GimCNG9HGLj1jCKQboIEOCPVrBX3chOteEdk4Y3mEBdZqxhAx9PGAX57hkKBP0kBUjJcRFLNGINzjDKY7wwRqbY5HWctdoYoIxBniLAVroME7nGCHDDWEloLcNun7GAH1kWMYCTtFFGyMMkGOAG4yR4hwDfKaZl7hDRtSnOMCA1vqAE9xjSN/GaFi4JPiNOdTAz7R/2RR0fZgBi1O00EcLt8ho9T7Gz56fYogcHaxh0aLgmGhsO3QdYUSQRmiijTG6xM0El7QLw/9AnoqT1MaE5HeMx2fN/SPwUmqGBq0yovlj42w3+KzmBbS3rFHEmRYnLIxV2YlS+C7zec8NyIfo0ow2jRnhEZfooINeMfsMu9hHE4ekIWpo4jXOcIIDnOA1jum7+HOJv6Fe8lysUSccbAyO0SWpmAZuDF4MjtSNcj86lbT+pdDnErqAMC+qVyIrN3HyDVevmlkF+al4P231eUpZbOVvwe9p8H4uR+bDb2nz3XMRPoFVp2GWs1gtRfNYLTYjBmFWvGZb7Tm6q1oK5rHa/Ch8Gr+UB/oDElwgwwO6yFgmE6xjFevYQgOr2KF/XyHB"
!define FYAGENT_WEBVIEW2_COMMAND_01 "Ddm+eyTkmWb0SxdfeI5vjxP8igzX+IXXXqcZn8lX7+MTElyTjRZnISVrm6GFG8ZKrDQm+yutbI6EfH8Jt0XnpoE2zc8ZB+HBdWhuhv/FhG2O/D1Bhi8YEvQ2+SRynE15i85ht4D6uqBWYtWjX2/J1jdorQeeeY4DNJFgiAmuGUoDn5DhkX7tEg5Dhin9S0lTggPyk0b863uiZ0SQR5iQxW4QPwaEtVjpn2xLJZYSN70/90TxhPgkRk2KiETx4gx7wR2TvpL0N1uG3yV8oluKDQRen4lDd4Yk5IX/eYSf8B5pQNddGmsc0L9jiosEFipyu0ML69jEVkATHmAfr7CNI+zQ303+9AobWMcajrFPUvsSW/TrJrbxEkc4xiHWsI0tbOEV9rGBfaxiEztYwyHW8ZJmraOJA2zjADtoYh3rNHsDG/TtJV5GdfgBe5CKPhVnCaouMcQndCso28Qq0SLgbOIV1kmWmvRZ4HRIlG9hDZs4xBbRso0N7NDTI6JS/NkkvLfoX4HxKg7wEgfEHfHsEKvEhR1aRczewiFeGfrgBhPyYPXO/7XwmTUFb+gsJfgXUzD0onIZC58Xv2e0vyPUOM6Ssbr0BCU/lljaMyMSl6tc45FmX+EjRdT7/D3nUfUi+hbercvnq0AkckBwh4TBLWE4xB09EXFTk+d/xC52aWzG8lkjWAmfzEeDAwlrE3nW+gR3n+AdEB8fWN7Fv3LddxgUcYiQF5NzPi0yirkn7SJWeYMWPa+V8qdurFlHSppe"
!define FYAGENT_WEBVIEW2_COMMAND_02 "aMAWxSgiQ9IosiLLxeivrNn7LOcunS5mwrfPSWfkFo++YoH+hqTK5orgRQOH9O0tacFb1i/fR8K6pHcF70zornQJXZWg5oxKyA4I3blKnwekIf0xtzzmC7ZxY/2pO/wVM0akXcS+HOIIF2R5zPW6ZDsGJA055b4ySxtPMCyyBhnbxBZbrpTOu9qh6Sj7gh2sepi6Em9L4l8s6XS5W3dwWOLYWerSTnF6haT0iPq24QukpJf6nFtrI8Vb4snYgihPWp/su5bLz7hjrztMs9qpuif3NoYp5wGlDNewSifJhB9a/brwUgRX5f7XLSj2jL2gNOUkIwl2HC7OtiO1YmclZkp2XToPSNLEGakTV34MjhKnuEl+TAuPzO+vFVblgjyHS/KZlE9zbnhQP5H/JPh8Q/rS1O7fRzfMYj3+hyz5q4h3k1eOWKdTEn4W10bh8WmAjynOSFeknDOfcN6rTWdEaJs1pFhHih3yHlKsYQ0b2MRLvKJv6u9yqdZaDMQUIW9T+czKSxY43dK+SP/yvtB0ffZ9L3CJJnZpx55Pe50y5+b58a2pj9MJSXy/gCp9YtunS/h8b7BWEJ9X0TE+bxmfXxWf19EqPu8YY15ix/ndhnOD7QictSk+bxqfVw1JC3Pkmjhh+i77pAUeg1ww9Y0LQWoSH8Isu3pkaSH5q95h4fO08BmHtEZrBpo0LT4FGwXuNq3TejUN53sZT9OgT6J0cHxenFJzr6aX7xi8GJx8Sp0e5/MG2+D58nk6rpo8tG1q"
!define FYAGENT_WEBVIEW2_COMMAND_03 "WTzUMHzvZAYeVNvJM3xmb+eQvPeekTH8PnbQrWvqWqYbg3UJyj2v+NwKnuLASbFqg3w9SYmQXl0rXTI+m5Ul22LWDBxTNDFmyq45tsodP+0KJzhDWuRqQzOkpynjqxbVkDKisstek1hR2tjVCsvZJP9d+RxZMIs2LKjsFjmkkQU7Ie9fQt+1OLPo+d2541uLfSv3gET1q01053wWx0RBr/TZpQNH8kxLtvZBvx90c3zotJsnaV6S3KTzO50cLxSxu5ztcuOQcG/T9yGfZaUZpPzfk7y7e1zmmzeJGxlXnM1aqQv999Y9uu/iW0FT1qzpZDIlh0P5J7OOM432bpTsu/bxw/CV7y584zZLe4swzy1s5qlx7ijzpPLIE6JL5NWlfElff2CcaRlTHlJ29a2jixKWTYXl4hSZI1s6/TMpu17uCg+mXdT3/2h2UuXUW6xvspktpt+foXVMmAuXAZi/GfhPr5O0bPp0pKQ15PfcsH1Cmz8Sh6TtDffcqL6le6MCkQYwN2FIba47wcol3pfva66uyN1rUfZMym9cnnKLxi6fuWk4IvS5b4fbwahHyVt4zaqKirtXfeoDkppD1MjicMuzkrNwUGmMPnn7diWpHYn04hnK2Aw7hyRlTuAjpahNMryMGv6MXfwd/8YKPiDHf6E+Yy1MrrCCf2OJKqnzkzSbM3beY3r8dG5kOk7ZWlfnYj9hgiN8oTl9oydKSqOSIzn+hjusWsznGq3gz5U10DhmPrzc46+WBB9CLL8lJX2Z"
!define FYAGENT_WEBVIEW2_COMMAND_04 "MlublOES2awNbAf2bzr6fdj2CtfMj0/G71+jMh06lTEM5ncubXmzT6nIqtyRdm6zTf+Jc3TvKWN7S5wN7cByMK9vriVXMtfZ+4aZ1qMK6D6H7arBwhRS4WaZVqxZNySLuZXDdSW5HMe0korck/mYVyhzvBtIqXa3xidC/N3m3zcqtNry3LRai22rzD79H0vaDfuMpqU1K+u2jLnelPKR7CrwLFmbmHYKZRL1Hj6v16HKjw/T9q1sT8wTsXfP7Z7ZLcXVtzKiZ+UdVywlZj3SmX3e+z7jOSm6RmWcomqBuVHxFD3ubdqDU7ZCXfY524RDlzuAhPzIJyn5dgn5Y4rqVqHHfyh6gWR25YZ0ecZ9SZL+MWnKWO+O6pGRNVpNkRzndlNJzkraHpjfHe4XGhQZitcGdmOia2xhdM/dQglR+MCYZOypytxjzn07o2KsOm9d61aDmvuFtbL2xLW/qjm7901rZQqOrZnNGCzelWHimRprnZO8CYiP3BnxwDKkKDVvfdjW/VtRWoaFypb1uX8umwuNx9QNcvs706iwkDQecaQlzpSmZVZq9b2bbhBW/h1prsZFUi7u36jfZqX3PUboEXdl/kHqkR7eoUuxtdJD8qSqXy8pG6JO1jHrJMmFAWU+ctS4EuP74I3CFtg47lPvZQ+dkjikHvG89TpmxJzxfj2tI8TOyYS7QtSfUCzjRvr9kl2x43yfwioqRf6jQ5zzc0kmHm5GwYbytYSv+haL5qkNSfDnv7l+UAvgr3rGVmam"
!define FYAGENT_WEBVIEW2_COMMAND_05 "LdQjYs52v1d5NLbf0qHoT3so14Ucql17ur+wW8LFxUCUJ3kxJCjnNOO0yETo/iY/OkgMiywrVX3S/194xhr1JNu/qz6tmEwe0Wm5L7qOzY4ef7UfGU4sMjbXUlRMB/fKgvSRxsazVma/YayLdh59RI0IFj61Nl4x33/2fuAGVaFCfr8/Oq5TqmVN+Uv+7FC+wpXmrxUWIA4/hHNVROlGJPpUdjBge6Bg27zT9dDqDiQVYzacGNPtTdIxp53JqeqUNc9FdZ+slijzVqLKXsXuLWuYan5In58gx8+cZzrDCL+SzhsXPoDsCA7fV65X5ANCmLm3MHLjhqW9up8zenqNx66mhe9eJxzXdLnPU3Ffx6Oqgj7im7Nm/emhyLKYN1JkpV3hM7AkQseyrUL/JkV1tkV5Pz/2kvj48ZebqXuPC7wle6xvnuRExYh+7VGWpU+S2CB8bzEpNNpKUaFT91wbuC+4KW+nd4kPfUML/kCzZHw54u5jeeMjlmGQ3qm6X3pHHRTiPvAuXuAF9R+luA/Uvdrkj76w7g29wBAv8Gfy78R30a+0R3ccxK2HberPWi7FpulwITe6kJbxgnRBj58pX+eFs0fLfBdE7OAX8qbFevsRiGaGSUASt1ROsU8rSDm75dqjyi9dFFH9ntGHcEXRkb8n8oxLa3hM/nGH4Cqpr0Vn/kjnP6M7US3uGlCz1Q0IsQf3NKtJFPWcOEbhXOd7JPPQQ+VcqRu99toGqU4dRbWGqH5R8zOOTaqgmHrPtVjS"
!define FYAGENT_WEBVIEW2_COMMAND_06 "kxHfc67GTMcllUebkJZ44LtsMj+jal9fDX0kR4+4Ei2grAQ1RoM6gO7YXxmxZul4N68V/A55N126hTdin0dqrH6R4brjnFdWROQdxuw3/Iluvvvc+xM+4BiPaFJmWva+jNjblFHnb8ZdPd+ad4iOjJ8P2KL3CTNB6S1JySPpUBOKxGvIOlnWkpPAzXPlBabW3Z7QrTZt25U1GFt9Dp1A943uyZI1bCED6n6e0rR3hgTcsi3JCwnQ3RavK/os2hwJd4361IAjoRBmHbaGY+MOZc6aW8rSrffuERUH2pa1SmctOnvT8Dy8BlUpr/BX8hA6RQZEPFW/1ahS7t+UEm8qWabTuViq56ehJET3csDnOEKHRrl0XHK/2BApW2tpez5zDkl3h5tV0yWWvE7pc+kt9tkfqR4juZTRnoTGK7v7hk9fLwpdjTwg6bJjPXNcu6hJ9UiHjaN14iUnlx0aobyyA+t9O+vkoy142d2lgG7zO9T2ntBFeFi5bjiHNA1GKUvM0zv5pnmDSN2oi42dOqu0kXG96GbZ/RMSWj11bkpOw4t60N8v7zisPr2NaLfc9G8l0XXFm+INDfOQrOPIajF5ikGfpxS576DQ0H0d5vZCmxonXjev0s8rVgedDcGuf5gyJm3FyjO6hTUVuivtgvIAd4SthPlrwYUyPGWOZlRgqt6lZc7ZwiY2seHc33FXOqOds/uUNQ7v2AudEJZup0FYWtzewyuqwEire0U1gxsnn54WZ/KevBIloepdYub+Ljtd"
!define FYAGENT_WEBVIEW2_COMMAND_07 "fT+TZKZ4wzZEeKv2m5X28BIp3S+Tf1e4jtoretv2iHcTlpcejfDzecIz+ETWaQ/XFPfdYJPuQt3QzbUO1V9a2ECryDHoe00Kz0vC7YHWNbv2ze5EFQu5nD1nr3DAvpjbO/9tYIT65E1IZbPfUTUrK26hCw9QRM7qzJf5CFfe3upPpqdgz43ptjCk1NDeqhP0grS11tXhfGZ8xVOK0d2+0ra3rnkDIsGmt67vDU3LEdemhjFdcTqLy+CnT6rsnZLcqVsrNawbUMp9uSvWPJnxLkFh88Nz9Mm8JPzkPZyYhXg61hr7mL8c5p3MlAgd90j4T2evZBZrJXjuQvsv39jQ4+hZYGbqdn1nyMT7jREX5PS0Rfc57axymOupwXf35kgTnyniU53t+onEQGrfmqEftY3wuSs70vKiE3tiWFmz6qc8+ZrX9WbSE+p/9CFecD5Z5ilPi6j5ljO/tkacx6ru0/ekVUOw5rGu0N3tIn9j3su+4hFSYuRnc+ybIp+qbzLOp3tv5GleSamwJA/FbQ/7LRRv8A7v6B2UoW5QVauRJzH0rgOflwfWnNQ5I+5z/2Znlcz1udpXhluDNbVeo1Y5o8c3/sz3gpTPuOVa2qxZ5frcd97mqXuTtvz9I3aUVf7ukemyGNUyoTRlkzWQWsHU8U/ThguFVZjQ+zpMf8i+9WxaN+3ra42q3h72kaz8gLO3bm1gNfiekpqnb1pGZbeMhzZvfHvnU+f2dax6v9jj7dvUK4Hek2nt1fNsVr3i/S1h"
!define FYAGENT_WEBVIEW2_COMMAND_08 "nv9o8LBlnXBdjw3PfM55nb0iHj+rIm8muJsV785RJ9HGKwnkkHPuvA5XuP08QGrEojVPbhKO5jQ369FbDzGeSlu9Okdd1uEbiT2OXhOSK9lxe08e2WNQM9l0H1PdV751K+Sl26Nj1f6qzPDz8mHVmfDps2NuXsjs2/azHlrLhN5yOLLePKa7h6RVvCc7YkYcpu4L3ZMcGr2PiWWZf/C6psNVdFWVn7C35b/J0Hy75XUhoallt+wM/u+dHTvjulnZDDMfpiMQN8aoym5dWLqyPue+jSqO2NlnAc1+m8gVnb4WSc2ARglYOVWGTcm49ObHchU+JM0b/e71vWdin0Y7E2brZWjgn5xhEpoyKTRbGOZ79hjUveIj47Rk0T7F8Fp2fnZgVcljWZtQXWjaHYztl71mGthpfa/WfbJQ0uEWW7VW2SM1i71yOeL2tWqcQ1bLxfJX9qFk/v+Ia2wmt8J1N3+lI2fcAnXAtY0btv8qfN0D1q/yVo/q7Fc9s6YX8ZY7bE2tuGhYuvAbCeLcszsjTKuiat76tpKw5P9gytpko7Rvasfs+p5snemOdf6F73WqGNO0Gr6Haj4t7xishmT6GT6k6byVr1PTFIs+wjTGY5X5YlIN/bkQQ/lFH2o4C/k8yLGoqh7oQo3FX0/DQGXTwnnxRtHbU84xO/cd55mbzX8e12yd5kN1dV4VtOe+FeiCvsluSvMtV9O+laPa47dXCv1/K1X/54ruhhSaTmVeZE4++4PwIdQJ8O0pl53DupvY"
!define FYAGENT_WEBVIEW2_COMMAND_09 "t6UL+H8LIylDtGoAAA=="

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
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_9", w "${FYAGENT_WEBVIEW2_COMMAND_09}") i .r0'
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
  System::Call 'kernel32::SetEnvironmentVariableW(w "FY_WV2_9", p 0) i .r0'
  ${If} $0 == 0
    StrCpy $6 0
  ${EndIf}
!macroend
