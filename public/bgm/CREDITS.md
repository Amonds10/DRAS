# 배경 음악

이 폴더의 곡은 오픈소스 게임 [0 A.D.](https://play0ad.com/)의 음악입니다.

- 저작자: Wildfire Games (http://www.wildfiregames.com/)
- 작곡: Omri Lahav 외 0 A.D. 음악 팀
- 라이선스: Creative Commons Attribution-ShareAlike 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)
- 출처: https://github.com/0ad/0ad `binaries/data/mods/public/audio/music/`
- 변경: Ogg Vorbis를 MP3(160kbps)로 변환만 했습니다. 이 파일들도 CC BY-SA 3.0으로 배포합니다.

| 파일 | 원곡 | 쓰는 곳 |
|---|---|---|
| title.mp3 | Honor Bound | 메인, 편성 |
| map.mp3 | The Road Ahead | 성도(지도), 보상 |
| battle.mp3 | Taiko 1 | 1~5층 전투 |
| boss.mp3 | Taiko 2 | 보스·정예 전투 |
| victory.mp3 | You are Victorious! | 승리 |
| defeat.mp3 | Dried Tears | 패배, 결과 |

## 곡 바꾸기

`tracks.json`에 장면 이름과 파일 이름을 적으면 그 곡을 반복 재생합니다. 직접 가진 mp3 파일을 이 폴더에 넣고 이름만 바꿔 적으면 됩니다.

- 장면 이름: `title`, `map`, `battle`, `boss`, `victory`, `defeat`
- 층마다 다른 곡을 쓰려면 `dawn`, `neon`, `dune`, `snow`, `sky`를 따로 적습니다. 적지 않은 층은 `battle` 곡을 씁니다.
- 파일이 없거나 재생하지 못하면 게임이 직접 만드는 음악으로 돌아갑니다.

저작권이 있는 곡(유튜브에서 받은 상업 음악 등)은 배포하면 안 됩니다. 직접 만들었거나 사용을 허락받은 곡만 넣어 주세요.
