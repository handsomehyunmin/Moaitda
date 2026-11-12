# Together - 기능별 JavaScript 분리 버전

기존 script.js 한 파일에 있던 기능을 여러 JavaScript 모듈로 나눴습니다.

js/config.js       : FastAPI 서버 주소와 세션 키
js/state.js        : 로그인 사용자, 게시글, 선택된 게시글 등 공용 상태
js/ui.js           : 화면 전환, 모달, 토스트, DOM 선택
js/utils.js        : 날짜, HTML 이스케이프, 프로필 이미지, 이미지 축소
js/session.js      : 로그인 세션 저장/복원/삭제
js/api.js          : FastAPI 요청 공통 처리
js/auth.js         : 로그인, 회원가입, 로그아웃
js/posts.js        : 게시글 목록, 작성, 수정, 삭제, 좋아요
js/comments.js     : 댓글 표시 및 댓글 작성
js/profile.js      : 프로필 표시 및 프로필 사진 변경
js/navigation.js   : 검색, 필터, 사이드바, 화면/모달 이동
js/friend_chat.js  : 친구 1:1 채팅, 대화 기록, 재연결, 읽음 표시
js/chat_notifications.js : 채팅방 밖 새 메시지 알림, 친구별/전체 안 읽은 수
js/app.js          : 모든 기능 초기화 및 사이트 시작

index.html은 마지막 script 태그가 다음처럼 바뀌었습니다.
<script type="module" src="js/app.js"></script>

실행 방법:
1. 이 폴더에서 CMD를 엽니다.
2. py -m http.server 8080 --bind 0.0.0.0
3. 브라우저에서 http://127.0.0.1:8080 접속

채팅 사용:
- 백엔드를 재시작하면 기존 DB에 읽음 상태 필드가 자동 추가됩니다.
- 친구 목록의 메시지 버튼으로 대화를 시작합니다.
- 현재 대화창을 활성 탭에서 보고 있을 때 읽음 처리합니다.
- 다른 화면의 새 메시지는 화면 알림과 친구 목록 배지로 표시됩니다.
- 알림을 클릭하면 해당 친구와의 대화창이 열립니다.
- 알림은 사이트가 열려 있을 때 동작합니다. 브라우저를 닫은 상태의 푸시 알림은 포함하지 않습니다.

검증 (프로젝트 루트에서):
backend/venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
backend/venv/Scripts/python.exe -B -m unittest discover -s backend/tests -v
backend/venv/Scripts/python.exe -B backend/tests/browser_chat.py
브라우저 테스트는 설치된 Chrome을 사용하며 실제 DB 대신 임시 DB를 사용합니다.
