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
js/app.js          : 모든 기능 초기화 및 사이트 시작

index.html은 마지막 script 태그가 다음처럼 바뀌었습니다.
<script type="module" src="js/app.js"></script>

실행 방법:
1. 이 폴더에서 CMD를 엽니다.
2. py -m http.server 8080 --bind 0.0.0.0
3. 브라우저에서 http://127.0.0.1:8080 접속
