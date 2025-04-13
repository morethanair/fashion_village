import GardenScene from './scenes/GardenScene.js';
import HomeScene from './scenes/HomeScene.js';

const config = {
    type: Phaser.AUTO, // WebGL 또는 Canvas 자동 선택
    width: 640,        // 게임 화면 너비
    height: 720,       // 게임 화면 높이 (UI 80px + 게임 영역 640px)
    backgroundColor: '#f0f0f0', // 게임 영역 바깥 배경색
    parent: 'game-container', // 게임 캔버스를 삽입할 HTML 요소 ID
    physics: { // 물리 엔진 설정 추가
        default: 'arcade', // Arcade Physics 사용
        arcade: {
            gravity: { y: 0 }, // y축 중력 없음 (top-down)
            debug: false // 디버그 모드 비활성화 (필요시 true로 변경)
        }
    },
    scene: [
        GardenScene, // 기존 GardenScene
        HomeScene    // 새로 추가된 HomeScene
        // 여기에 다른 Scene들을 추가할 예정입니다.
    ]
};

// Phaser 게임 인스턴스 생성
const game = new Phaser.Game(config); 