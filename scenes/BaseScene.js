// import Phaser from 'phaser'; // Removed as Phaser is loaded globally

export default class BaseScene extends Phaser.Scene {
    constructor(config) {
        super(config);
        
        // 게임 시간 관련 변수
        this.gameTime = {
            hours: 10,       // 게임 시작 시간 (오전 10시)
            minutes: 0,
            day: 1,          // 게임 날짜
            dayNames: ['일', '월', '화', '수', '목', '금', '토'],
            timeScale: 1.2    // 실제 시간 20분 = 게임 내 24시간 (1440분), 1초에 1.2분
        };
        
        // UI 요소
        this.timeText = null;
        this.dateText = null;
        this.inventoryIcon = null;
        
        // UI 영역 크기
        this.uiHeight = 60;  // UI 바 높이 (픽셀)
        this.timeScale = 1.2; // 실제 시간 대비 게임 내 시간 흐름 배율
        this.elapsedTime = 0; // 총 경과 시간 (밀리초)
        this.time24h = { hour: 6, minute: 0 }; // 게임 내 24시간 시간 (시작: 아침 6시)
        this.isDaytime = true; // 낮/밤 상태
        this.isTransitioning = false; // 시간 전환 중인지 여부
        this.transitioning = false; // 씬 전환 중인지 여부

        // 그리드 시스템 공통 설정
        this.tileSize = 32;
        // 기본 그리드 크기 - create 메소드에서 업데이트됨
        this.gridWidth = 20;  // 기본값
        this.gridHeight = 20; // 기본값
        
        this.occupiedCells = new Set(); // 점유된 셀 추적
        this.easystar = null;
        this.movePath = null;
        this.movePathIndex = -1;
        this.isCalculatingPath = false;
    }
    
    create() {
        // 그리드 크기 업데이트 (cameras.main이 이제 사용 가능)
        this.gridWidth = Math.floor(this.cameras.main.width / this.tileSize);
        this.gridHeight = Math.floor((this.cameras.main.height - this.uiHeight) / this.tileSize);
        
        console.log(`Grid dimensions updated: ${this.gridWidth}x${this.gridHeight} (tiles: ${this.tileSize}px)`);
        console.log(`Available game area: ${this.cameras.main.width}x${this.cameras.main.height - this.uiHeight}px`);
        
        // UI 레이어를 먼저 생성 (sunMoonIcon 생성)
        this.createUILayer();
        
        // 게임 영역 설정
        this.setupGameArea();
        
        // 시간 업데이트 타이머
        this.timeUpdateTimer = this.time.addEvent({
            delay: 1000,              // 1초마다
            callback: this.updateGameTime,
            callbackScope: this,
            loop: true
        });
    }
    
    // 게임 영역 설정
    setupGameArea() {
        console.log(`Setting up game area: ${this.cameras.main.width}x${this.cameras.main.height}`);
        
        // 메인 카메라에 배경색 설정 (게임 영역 전체에 적용)
        this.cameras.main.setBackgroundColor('#000000');
        
        // 물리 월드 경계 설정 (UI 영역 아래부터 시작)
        const worldWidth = this.gridWidth * this.tileSize;
        
        // 정확한 게임 높이 계산 (UI 영역 제외)
        const gameHeight = this.gridHeight * this.tileSize;
        const exactGameHeight = this.cameras.main.height - this.uiHeight;
        
        // 물리 월드 경계 설정 - 화면 하단보다 2픽셀 작게 설정하여 픽셀 클리핑 방지
        this.physics.world.setBounds(0, this.uiHeight, worldWidth, exactGameHeight - 2);
        
        // 게임 배경 직사각형 추가 (그리드 영역만 초록색으로 채움)
        this.gameBackground = this.add.rectangle(
            0, this.uiHeight,
            worldWidth, gameHeight,
            0x5ca645
        ).setOrigin(0, 0).setDepth(-2); // 모든 레이어보다 뒤에 위치
        
        // 밤 오버레이 설정 (초기에는 투명)
        if (!this.nightOverlay) {
            this.nightOverlay = this.add.rectangle(
                0, this.uiHeight, 
                worldWidth, gameHeight, 
                0x000000, 0
            ).setOrigin(0, 0).setDepth(1); // 게임 요소 위에 배치
        }
        console.log(`Night overlay created: ${worldWidth}x${gameHeight} at (0,${this.uiHeight})`);
        
        // 환경 효과 초기화
        this.updateEnvironmentByTime();
    }
    
    // UI 레이어 생성
    createUILayer() {
        // UI 배경
        this.uiBackground = this.add.rectangle(
            0, 0, 
            this.cameras.main.width, 
            this.uiHeight,
            0x333333
        ).setOrigin(0, 0).setScrollFactor(0).setDepth(10);
        
        // 시간 텍스트
        this.timeText = this.add.text(
            10, 10,
            '로딩 중...',
            {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#ffffff'
            }
        ).setScrollFactor(0).setDepth(10);
        
        // 날짜 텍스트
        this.dateText = this.add.text(
            10, 40,
            '1일차 (월)',
            {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#ffffff'
            }
        ).setScrollFactor(0).setDepth(10);
        
        // 해/달 아이콘 (UI로 이동)
        this.sunMoonIcon = this.add.text(
            this.cameras.main.width - 140, 
            20,
            '☀️',   // 초기값: 해
            { fontSize: '32px' }
        ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10);
        
        // 인벤토리 버튼
        this.inventoryIcon = this.add.text(
            this.cameras.main.width - 50, 20,
            '🎒',
            {
                fontFamily: 'Arial',
                fontSize: '32px'
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(10).setInteractive({ useHandCursor: true });
        
        this.inventoryIcon.on('pointerdown', () => {
            console.log('인벤토리 열기');
            // TODO: 인벤토리 UI 표시
        });
    }
    
    // 시간에 따른 환경 업데이트
    updateEnvironmentByTime() {
        const { hours } = this.gameTime;
        
        // sunMoonIcon이 정의되었는지 확인
        if (!this.sunMoonIcon) return;
        
        // 낮밤 전환 (6시-18시: 낮, 그 외: 밤)
        if (hours >= 6 && hours < 18) {
            // 낮
            this.sunMoonIcon.setText('☀️'); // 해 아이콘
            
            // 낮 시간대별 밝기 조절
            let alpha = 0;            
            if (hours < 7) alpha = 0.3;      // 새벽
            else if (hours > 17) alpha = 0.3; // 해질녘
            else alpha = 0;                  // 낮 (완전 밝음)
            
            this.nightOverlay.setAlpha(alpha);
        } else {
            // 밤
            this.sunMoonIcon.setText('🌙'); // 달 아이콘
            
            // 밤 시간대별 어둡기 조절
            let alpha = 0.5;                 // 기본 밤 어둑함
            if (hours >= 22 || hours < 4) alpha = 0.7; // 깊은 밤
            
            this.nightOverlay.setAlpha(alpha);
        }
    }
    
    // 게임 시간 업데이트
    updateGameTime() {
        // 1초마다 게임 내 시간 업데이트
        this.gameTime.minutes += this.gameTime.timeScale;
        
        // 소수점 제거 (추가)
        this.gameTime.minutes = Math.floor(this.gameTime.minutes);
        
        // 시간 처리
        if (this.gameTime.minutes >= 60) {
            this.gameTime.hours += Math.floor(this.gameTime.minutes / 60);
            this.gameTime.minutes %= 60;
            
            // 날짜 처리
            if (this.gameTime.hours >= 24) {
                this.gameTime.hours %= 24;
                this.gameTime.day++;
            }
        }
        
        // 시간 텍스트 업데이트
        const ampm = this.gameTime.hours < 12 ? '오전' : '오후';
        const hours = this.gameTime.hours % 12 || 12; // 12시간제 변환
        const minutes = this.gameTime.minutes < 10 ? `0${this.gameTime.minutes}` : this.gameTime.minutes;
        this.timeText.setText(`${ampm} ${hours}:${minutes}`);
        
        // 날짜 텍스트 업데이트
        const dayOfWeek = this.gameTime.dayNames[(this.gameTime.day - 1) % 7];
        this.dateText.setText(`${this.gameTime.day}일차 (${dayOfWeek})`);
        
        // 시간에 따른 이벤트 처리 (필요시)
        this.handleTimeEvents();
        
        // 환경에 따른 효과 업데이트
        this.updateEnvironmentByTime();
    }
    
    // 특정 시간대에 따른 이벤트 처리 (자식 클래스에서 확장)
    handleTimeEvents() {
        // 예: 밤에는 조명 변경, 아침에는 NPC 등장 등
    }
    
    // 시간 상태 가져오기 (다른 클래스에서 접근 가능)
    getTimeState() {
        return {
            isNight: this.gameTime.hours >= 20 || this.gameTime.hours < 6,
            isMorning: this.gameTime.hours >= 6 && this.gameTime.hours < 12,
            isAfternoon: this.gameTime.hours >= 12 && this.gameTime.hours < 17,
            isEvening: this.gameTime.hours >= 17 && this.gameTime.hours < 20,
            hours: this.gameTime.hours,
            minutes: this.gameTime.minutes,
            day: this.gameTime.day
        };
    }
    
    // 씬 전환 시 시간 상태 전달
    passTimeToNextScene(targetScene) {
        targetScene.gameTime = { ...this.gameTime };
    }

    // --- 좌표 변환 공통 함수 --- 
    worldToGrid(worldX, worldY) {
        // UI 영역 높이를 고려하여 Y 좌표 조정
        const adjustedY = worldY - this.uiHeight;
        
        const gridCol = Math.floor(worldX / this.tileSize);
        const gridRow = Math.floor(adjustedY / this.tileSize);
        // 그리드 범위 벗어나지 않도록 제한
        return { 
            col: Phaser.Math.Clamp(gridCol, 0, this.gridWidth - 1), 
            row: Phaser.Math.Clamp(gridRow, 0, this.gridHeight - 1) 
        };
    }

    gridToWorld(gridCol, gridRow) {
        const worldX = gridCol * this.tileSize + this.tileSize / 2;
        // UI 영역 높이를 고려하여 Y 좌표 조정
        const worldY = gridRow * this.tileSize + this.tileSize / 2 + this.uiHeight;
        return { x: worldX, y: worldY };
    }

    // --- EasyStar 초기화 함수 ---
    initializeEasyStar(gridData, allowDiagonals = false) {
        this.easystar = new EasyStar.js();
        this.easystar.setGrid(gridData);
        this.easystar.setAcceptableTiles([0]); // 0만 이동 가능한 타일로 설정
        if (allowDiagonals) {
            this.easystar.enableDiagonals();
        }
        this.easystar.enableCornerCutting(false); // 코너 컷팅 방지
        return this.easystar;
    }

    // --- EasyStar 이동 요청 함수 --- 
    moveToGridCell(targetCol, targetRow, callback) {
        if (!this.player || !this.easystar) {
            console.error('Player or EasyStar not initialized');
            return false;
        }

        const startGrid = this.worldToGrid(this.player.x, this.player.y);
        
        // 경로 계산 중에는 새로운 요청 무시 (플래그 사용)
        if (this.isCalculatingPath) {
            console.log('Path calculation already in progress.');
            return false;
        }

        // 경로 계산 시작 플래그 설정
        this.isCalculatingPath = true;
        console.log('Starting path calculation...');

        this.easystar.findPath(startGrid.col, startGrid.row, targetCol, targetRow, (path) => {
            // 경로 계산 완료 플래그 해제
            this.isCalculatingPath = false;
            console.log('Path calculation finished.');

            if (path === null) {
                console.warn(`No path found to [${targetCol}, ${targetRow}]!`);
                // 이동 상태 초기화
                this.movePath = null;
                this.movePathIndex = -1;
                if(this.player.body) this.player.body.stop(); // 플레이어 정지
                if (callback) callback(false); // 콜백 호출 (실패)
            } else {
                console.log(`Path found to [${targetCol}, ${targetRow}]. Length: ${path.length}`);
                // 경로 시작 (0번 인덱스는 현재 위치이므로 1번부터)
                this.movePath = path;
                this.movePathIndex = 1;
                if (callback) callback(true); // 콜백 호출 (성공)
            }
        });
        this.easystar.calculate();
        return true;
    }

    // --- 인접 빈 셀 찾기 헬퍼 ---
    findWalkableAdjacentCell(targetCol, targetRow) {
        const adjacentOffsets = [
            { dr: 1, dc: 0 }, // 아래
            { dr: -1, dc: 0 }, // 위
            { dr: 0, dc: 1 }, // 오른쪽
            { dr: 0, dc: -1 }  // 왼쪽
        ];

        // 무작위 순서로 방향 섞기 (다양한 방향에서 접근하도록)
        Phaser.Utils.Array.Shuffle(adjacentOffsets);

        for (const offset of adjacentOffsets) {
            const checkRow = targetRow + offset.dr;
            const checkCol = targetCol + offset.dc;
            const cellKey = `${checkCol},${checkRow}`;

            // 그리드 범위 내이고, 점유되지 않았는지 확인
            if (checkRow >= 0 && checkRow < this.gridHeight &&
                checkCol >= 0 && checkCol < this.gridWidth &&
                !this.occupiedCells.has(cellKey))
            {
                // 이동 가능한 인접 셀 찾음
                return { col: checkCol, row: checkRow };
            }
        }
        // 모든 인접 셀이 막혀있거나 범위를 벗어남
        return null;
    }

    // --- 경로 이동 업데이트 (update 메서드에서 호출) ---
    updatePathMovement(delta) {
        if (this.movePath && this.movePathIndex !== -1 && this.movePathIndex < this.movePath.length) {
            const nextNode = this.movePath[this.movePathIndex];
            const targetWorldPos = this.gridToWorld(nextNode.x, nextNode.y);
            const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, targetWorldPos.x, targetWorldPos.y);
            const speed = 150;

            if (distance < 5) {
                // 현재 노드 도착, 다음 노드로 인덱스 증가
                this.movePathIndex++;
                // 경로 끝에 도달했는지 체크
                if (this.movePathIndex >= this.movePath.length) {
                    console.log('Path end reached.');
                    // 경로 완료, 플레이어 정지 및 상태 초기화
                    this.player.body.reset(targetWorldPos.x, targetWorldPos.y); // 정확한 위치로
                    const endReached = true;
                    this.movePath = null;
                    this.movePathIndex = -1;
                    return endReached; // 경로 끝 도달 알림
                }
            } else {
                // 아직 다음 노드로 이동 중
                this.physics.moveToObject(this.player, targetWorldPos, speed);
            }
        }
        return false; // 경로 끝에 도달하지 않음
    }

    // --- 임시 메시지 표시 함수 ---
    showTemporaryMessage(message, duration = 2000) {
        // 기존 메시지가 있으면 제거
        if (this.temporaryMessageText) {
            this.temporaryMessageText.destroy();
        }

        // 화면 상단 중앙에 텍스트 생성
        this.temporaryMessageText = this.add.text(
            this.cameras.main.width / 2,
            this.uiHeight + 20, // UI 영역 바로 아래
            message,
            {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#ffffff',
                backgroundColor: 'rgba(0,0,0,0.7)',
                padding: { x: 10, y: 5 },
                align: 'center'
            }
        ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20); // 가장 위에 보이도록

        // 일정 시간 후 메시지 제거
        this.time.delayedCall(duration, () => {
            if (this.temporaryMessageText) {
                this.temporaryMessageText.destroy();
                this.temporaryMessageText = null; // 참조 제거
            }
        });
    }

    // --- 플레이어 생성 공통 함수 ---
    createPlayer(initialCol, initialRow) {
        const initialWorldPos = this.gridToWorld(initialCol, initialRow);
        console.log(`BaseScene: Creating player at world [${initialWorldPos.x.toFixed(0)}, ${initialWorldPos.y.toFixed(0)}] (grid [${initialCol}, ${initialRow}])`);

        const player = this.physics.add.sprite(initialWorldPos.x, initialWorldPos.y, 'player');
        if (player.body) {
            player.body.setCollideWorldBounds(true);
            // 필요시 body 크기/오프셋 조정
            // player.body.setSize(width, height).setOffset(x, y);
        } else {
            console.error('BaseScene: Failed to enable physics on player sprite!');
            return null; // 오류 발생 시 null 반환
        }
        player.setInteractive(); // 클릭 상호작용 활성화 (이동 중단 등)
        player.setData('gridCol', initialCol); // 초기 그리드 위치 저장
        player.setData('gridRow', initialRow);

        // 플레이어 클릭 시 이동 중단 리스너 (공통)
        player.on('pointerdown', (pointer) => {
            pointer.stopPropagation();
            if(player.body) player.body.stop();
            this.movePath = null;
            this.movePathIndex = -1;
            console.log('BaseScene: Player clicked, stopped movement.');
            // 특정 Scene에서 추가 동작 필요 시, Scene 내부에서 별도 리스너 추가 가능
        });

        return player;
    }

    // --- 말풍선 생성 헬퍼 ---
    createSpeechBubble(x, y, text, duration = 2000) {
        // 기존 말풍선 제거 (한 번에 하나만 표시)
        if (this.speechBubbleContainer) {
            this.speechBubbleContainer.destroy();
        }

        const bubblePadding = 10;
        const arrowHeight = 10;

        // 텍스트 객체 먼저 생성해서 크기 계산
        const textObject = this.add.text(0, 0, text, {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#000000',
            backgroundColor: '#ffffff', // 임시 배경색으로 크기 측정 용이
            padding: { x: bubblePadding, y: bubblePadding },
            wordWrap: { width: 150 }, // 자동 줄바꿈 너비
            align: 'center'
        }).setOrigin(0.5, 1); // 텍스트 원점을 하단 중앙으로

        // 텍스트 크기에 맞춰 버블 크기 계산
        const bubbleWidth = textObject.width;
        const bubbleHeight = textObject.height;

        // 버블 배경 그래픽 생성 (텍스트 뒤에)
        const bubble = this.add.graphics();
        bubble.fillStyle(0xffffff, 1);
        bubble.fillRoundedRect(
            -bubbleWidth / 2, // 텍스트 원점 기준 상대 좌표
            -(bubbleHeight + arrowHeight),
            bubbleWidth,
            bubbleHeight,
            16 // 모서리 둥글기
        );
        // 말풍선 꼬리 (삼각형)
        bubble.fillTriangle(
            0, 0,             // 꼬리 끝점 (원점)
            -10, -arrowHeight, // 왼쪽 위
            10, -arrowHeight  // 오른쪽 위
        );

        // 텍스트 배경색 제거 및 위치 조정
        textObject.setBackgroundColor(null); // 실제 배경은 Graphics가 담당
        textObject.setPosition(0, -(arrowHeight + bubblePadding / 2)); // 버블 내부 Y 위치 조정 (padding 고려)

        // 컨테이너로 묶기
        this.speechBubbleContainer = this.add.container(x, y, [bubble, textObject]);
        this.speechBubbleContainer.setDepth(15); // 메시지보다 위에, UI보다는 아래에?

        // 일정 시간 후 제거
        this.time.delayedCall(duration, () => {
            if (this.speechBubbleContainer) {
                this.speechBubbleContainer.destroy();
                this.speechBubbleContainer = null;
            }
        });

        return this.speechBubbleContainer; // 필요시 참조 반환
    }
} 