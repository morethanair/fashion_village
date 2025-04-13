import BaseScene from './BaseScene.js';

export default class HomeScene extends BaseScene {
    constructor() {
        super({ key: 'HomeScene' });
        this.player = null;
        this.targetPosition = null;
        this.exitDoor = null;
        this.isTransitioningToGarden = false;
        this.arrivalData = null; // 도착 정보 저장 변수 (grid 포함)

        // Grid Config - BaseScene에서 상속받음
        this.tileSize = 32;
        // gridWidth와 gridHeight는 BaseScene에서 상속받음
        // HomeScene에서는 occupiedCells가 필요 없을 수 있음 (식물 없으므로)
        console.log(`HomeScene Grid initialized with default values`);
        
        // EasyStar Config
        this.easystar = null;
        this.movePath = null;
        this.movePathIndex = -1;
        this.isCalculatingPath = false;
    }

    // init 메소드 추가: Scene 시작 시 데이터 수신
    init(data) {
        console.log('HomeScene init data:', data);
        this.arrivalData = data;
    }

    preload() {
        // HomeScene에서 필요한 스프라이트 로드 (플레이어, 문)
        // GardenScene에서 로드했더라도 명시적으로 추가하는 것이 좋음
        this.load.image('player', 'assets/sprites/player.png'); // 플레이어는 필요
        this.load.image('door', 'assets/sprites/door.png');     // 문 이미지 로드 추가
        this.load.image('tiles_home', 'assets/tiles/wood_floor.png'); // 홈 바닥 타일 로드 (새 키 사용)
        this.load.image('wall', 'assets/tiles/wall.png'); // 벽 타일 이미지 로드 추가
        this.load.image('pink_wall', 'assets/tiles/pink_wall.png'); // 분홍색 벽지 타일 로드
    }

    create() {
        // BaseScene의 create 메서드 호출 (UI 및 시간 초기화)
        super.create();
        
        // --- EasyStar 초기화 --- 
        const gridData = [];
        for(let y = 0; y < this.gridHeight; y++){
            const row = [];
            for(let x = 0; x < this.gridWidth; x++){
                // 1은 장애물 (벽, 가구 등), 0은 이동 가능
                const cellKey = `${x},${y}`;
                const isOccupied = this.occupiedCells.has(cellKey);
                row.push(isOccupied ? 1 : 0);
            }
            gridData.push(row);
        }
        
        // BaseScene의 초기화 함수 사용, 대각선 이동 비활성화
        this.initializeEasyStar(gridData, false);
        
        console.log('EasyStar initialized');
        // -----------------------
        
        // 카메라 배경색은 BaseScene에서 설정되므로 제거
        // this.cameras.main.setBackgroundColor('#FFFFE0');
        // this.add.text(300, 50, 'Home Scene', { fontSize: '32px', fill: '#333' }).setOrigin(0.5); // 텍스트 제거 또는 주석처리

        // --- Tilemap 생성 (Home 바닥 타일 사용) --- 
        // 참고: 타일맵의 높이/너비는 물리 세계와 일치하도록 설정
        const map = this.make.tilemap({ 
            tileWidth: this.tileSize, 
            tileHeight: this.tileSize, 
            width: this.gridWidth, 
            height: this.gridHeight
        });
        
        const tileset = map.addTilesetImage('tiles_home', 'tiles_home', this.tileSize, this.tileSize, 0, 0);
        const wallTileset = map.addTilesetImage('wall', 'wall', this.tileSize, this.tileSize, 0, 0);
        
        if (!tileset || !wallTileset) {
             console.error("Home Tileset could not be added."); return;
        }
        
        // 레이어 생성 (타일맵의 위치를 UI 영역 아래로 조정)
        const groundLayer = map.createBlankLayer('ground', tileset, 0, this.uiHeight);
        if (!groundLayer) {
             console.error("Home ground layer could not be created."); return;
        }
        
        // 타일맵 채우기
        groundLayer.fill(0);
        groundLayer.setDepth(-1);
        
        // 벽 레이어 생성
        const wallLayer = map.createBlankLayer('wall', wallTileset, 0, this.uiHeight);
        if (!wallLayer) {
            console.error("Wall layer could not be created."); return;
        }
        wallLayer.setDepth(0); // groundLayer보다 위에 보이도록
        
        // 분홍색 벽지 레이어 생성
        const pinkWallTileset = map.addTilesetImage('pink_wall', 'pink_wall', this.tileSize, this.tileSize, 0, 0);
        if (!pinkWallTileset) {
            console.error("Pink wall tileset could not be added."); return;
        }
        
        const pinkWallLayer = map.createBlankLayer('pink_wall', pinkWallTileset, 0, this.uiHeight);
        if (!pinkWallLayer) {
            console.error("Pink wall layer could not be created."); return;
        }
        pinkWallLayer.setDepth(0); // 다른 레이어와 같은 깊이로 설정

        // 문 위치 (하단 중앙)
        const doorGridCol = Math.floor(this.gridWidth / 2);
        const doorGridRow = this.gridHeight - 2;
        const doorWorldPos = this.gridToWorld(doorGridCol, doorGridRow);
        
        // 방의 0, -1 열과 0, 1 행에 분홍색 벽지 추가
        for (let col = 0; col < this.gridWidth; col++) {
            // 0번 행(맨 위) 채우기
            pinkWallLayer.putTileAt(0, col, 0);
            // 1번 행 채우기
            pinkWallLayer.putTileAt(0, col, 1);
            
            // EasyStar에 벽 위치 추가 (충돌 처리)
            this.easystar.avoidAdditionalPoint(col, 0);
            this.easystar.avoidAdditionalPoint(col, 1);
        }
        
        for (let row = 0; row < this.gridHeight; row++) {
            // 0번 열(맨 왼쪽) 채우기
            pinkWallLayer.putTileAt(0, 0, row);
            // 맨 오른쪽 열 채우기
            pinkWallLayer.putTileAt(0, this.gridWidth - 1, row);
            
            // EasyStar에 벽 위치 추가 (충돌 처리)
            this.easystar.avoidAdditionalPoint(0, row);
            this.easystar.avoidAdditionalPoint(this.gridWidth - 1, row);
        }
        
        console.log('Pink wall tiles added to room borders');
        
        // 하단 부분(-1, -2 행)에 문이 없는 부분에만 벽 타일 배치
        for (let col = 0; col < this.gridWidth; col++) {
            // 문이 있는 column은 건너뛰기
            if (col === doorGridCol) continue;
            
            // -1 행 채우기 (맨 아래에서 1번째 행)
            const bottomRow1 = this.gridHeight - 1;
            wallLayer.putTileAt(0, col, bottomRow1);
            
            // -2 행 채우기 (맨 아래에서 2번째 행)
            const bottomRow2 = this.gridHeight - 2;
            wallLayer.putTileAt(0, col, bottomRow2);
            
            // 물리적 충돌 설정 및 EasyStar 장애물 설정
            this.easystar.avoidAdditionalPoint(col, bottomRow1);
            this.easystar.avoidAdditionalPoint(col, bottomRow2);
        }
        
        // 가장 하단 행에도 벽 타일 추가 (연두색 띠와 검은 픽셀 문제 해결)
        const veryBottomRow = this.gridHeight;
        for (let col = 0; col < this.gridWidth; col++) {
            // 맨 아래 행 전체를 벽 타일로 채움
            wallLayer.putTileAt(0, col, veryBottomRow);
        }
        
        // 왼쪽 아래 코너 (0, 1 컬럼의 -1, -2 행)와 오른쪽 끝 컬럼에 wall.png 타일 추가
        // 이 부분은 분홍색 벽지가 아닌 일반 벽으로 설정
        const leftBottomCols = [0, 1]; // 0컬럼과 1컬럼
        const rightCol = [this.gridWidth - 1]; // 오른쪽 끝 컬럼
        const bottomRows = [this.gridHeight - 1, this.gridHeight - 2]; // -1행과 -2행
        
        // 왼쪽 아래 코너 처리
        for (const col of leftBottomCols) {
            for (const row of bottomRows) {
                // 이미 분홍색 벽지로 덮여 있을 수 있으므로 해당 부분의 분홍색 벽지 타일 제거
                pinkWallLayer.removeTileAt(col, row);
                
                // 벽 타일 추가
                wallLayer.putTileAt(0, col, row);
                
                // 물리적 충돌 설정 (이미 설정되어 있을 수 있음)
                this.easystar.avoidAdditionalPoint(col, row);
            }
        }
        
        // 오른쪽 끝 컬럼 처리
        for (const col of rightCol) {
            for (const row of bottomRows) {
                // 이미 분홍색 벽지로 덮여 있을 수 있으므로 해당 부분의 분홍색 벽지 타일 제거
                pinkWallLayer.removeTileAt(col, row);
                
                // 벽 타일 추가
                wallLayer.putTileAt(0, col, row);
                
                // 물리적 충돌 설정 (이미 설정되어 있을 수 있음)
                this.easystar.avoidAdditionalPoint(col, row);
            }
        }
        
        console.log('Wall tiles added to bottom rows and left bottom corner');
        console.log('Home Tilemap created with wood floor tile at y=' + this.uiHeight);
        // -----------------------------------------

        // 시작 위치 결정
        let initialGridCol = Math.floor(this.gridWidth / 2);
        let initialGridRow = Math.floor(this.gridHeight / 2);
        if (this.arrivalData?.arrivingAt === 'exitDoor') {
            // GardenScene에서 도착: HomeScene의 출구 문 위쪽 셀에서 시작
            initialGridCol = doorGridCol; // HomeScene 문의 Col
            initialGridRow = doorGridRow - 1; // HomeScene 문의 Row - 1
            console.log(`Arriving from Garden, starting near exit door at grid [${initialGridCol}, ${initialGridRow}]`);
        } else {
            console.log('Starting HomeScene fresh, near center grid cell.');
        }
        const initialWorldPos = this.gridToWorld(initialGridCol, initialGridRow);
        console.log(`Home Player starting world pos: ${initialWorldPos.x}, ${initialWorldPos.y}`);

        // --- 플레이어 생성 (Sprite 사용) ---
        this.player = this.physics.add.sprite(initialWorldPos.x, initialWorldPos.y, 'player');
        // 물리 몸체 크기/위치 조절 (필요시)
        // this.player.body.setSize(width, height).setOffset(x, y);
        if (this.player.body) {
            this.player.body.setCollideWorldBounds(true);
        } else {
             console.error('Failed to enable physics on Home player sprite!'); return;
        }
        this.player.setInteractive(); // 클릭은 가능하지만 특별한 동작 없음 (이동 중단 등)
        this.player.on('pointerdown', (pointer, localX, localY, event) => {
             event.stopPropagation();
             if(this.player.body) this.player.body.stop();
             this.movePath = null;
             this.movePathIndex = -1;
             console.log('Home player clicked, stopped movement.');
        });
        console.log('Home Player sprite created');
        // -----------------------------------------------

        // --- 정원으로 나가는 문 생성 (Sprite 사용) ---
        // 원점을 상단 중앙(0.5, 0)으로 설정하여 셀 중앙에 문의 상단이 오도록 함
        this.exitDoor = this.add.sprite(doorWorldPos.x, doorWorldPos.y - this.tileSize/2, 'door').setOrigin(0.5, 0);
        this.exitDoor.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.exitDoor.width, this.exitDoor.height), Phaser.Geom.Rectangle.Contains);
        this.exitDoor.input.cursor = 'pointer';
        // 문 클릭 -> 문 앞 셀로 이동
        this.exitDoor.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            console.log('Door clicked, calculating path to door...');
            this.isTransitioningToGarden = true;
            
            // 플레이어가 이미 문 근처에 있는지 확인
            const playerGrid = this.worldToGrid(this.player.x, this.player.y);
            const doorTargetCol = doorGridCol;
            const doorTargetRow = doorGridRow + 1; // 문 아래 셀
            
            // 플레이어가 이미 문 인접 셀에 있으면 바로 이동 트리거
            if (playerGrid.col === doorTargetCol && playerGrid.row === doorTargetRow) {
                // 즉시 이동 트리거
                this.startGardenTransition();
            } else {
                // 아니면 경로 탐색 후 이동
                this.moveToGridCell(doorTargetCol, doorTargetRow, (pathFound) => {
                    if (!pathFound) {
                        console.log('No path to door found');
                        this.isTransitioningToGarden = false;
                    }
                });
            }
        });
        console.log('Exit Door sprite created');
        // ---------------------------------------

        // Scene 클릭 리스너 - 그리드 셀 이동
        this.input.on('pointerdown', (pointer) => {
            // 이미 계산 중이면 새 요청 무시
            if (this.isCalculatingPath) {
                console.log('Path calculation already in progress. Ignoring click.');
                return;
            }
            
            // 포인터 위치를 그리드 좌표로 변환
            const targetGrid = this.worldToGrid(pointer.worldX, pointer.worldY);
            
            // 문 주변 클릭 체크 (문 클릭 자체는 문 이벤트 핸들러에서 처리)
            const manhattanDistance = Math.abs(targetGrid.col - doorGridCol) + Math.abs(targetGrid.row - doorGridRow);
            if (manhattanDistance <= 1) { // 문 또는 주변 셀 클릭
                console.log('Clicked near door, moving to door entrance');
                
                // 전환 플래그를 false로 설정 (문 자체를 클릭한 것이 아니므로)
                this.isTransitioningToGarden = false; 
                
                // 문 앞 셀로 이동
                this.moveToGridCell(doorGridCol, doorGridRow + 1, (pathFound) => {
                    if (!pathFound) {
                        console.log('No path to door entrance found');
                    }
                });
                return;
            }
            
            // 셀이 점유되어 있는지 확인 (벽, 가구 등)
            const cellKey = `${targetGrid.col},${targetGrid.row}`;
            if (this.occupiedCells.has(cellKey)) {
                console.log(`Cannot move to [${targetGrid.col}, ${targetGrid.row}], cell occupied.`);
                return;
            }
            
            // 일반 이동
            console.log(`Calculating path to grid [${targetGrid.col}, ${targetGrid.row}]...`);
            this.isTransitioningToGarden = false; // 일반 이동은 전환 안함
            this.moveToGridCell(targetGrid.col, targetGrid.row, (pathFound) => {
                if (!pathFound) {
                    console.log(`No path to [${targetGrid.col}, ${targetGrid.row}] found`);
                }
            });
        });

        this.cameras.main.fadeIn(500, 0, 0, 0);
        this.isTransitioningToGarden = false;
        this.arrivalData = null;

        console.log('Home Scene Created for Grid');
    }

    // --- EasyStar 이동 요청 함수, 좌표 변환 함수, 그리드 그리기 함수는 BaseScene에서 제공하므로 제거 ---

    update(time, delta) {
        // BaseScene의 update 호출 (시간 업데이트 등)
        super.update(time, delta);
        
        // --- BaseScene의 경로 이동 업데이트 함수 사용 ---
        const pathEndReached = this.updatePathMovement(delta);
        
        // 경로 끝에 도달한 경우에만 도착 처리 로직 실행
        if (pathEndReached) {
            // 도착 지점에 따른 추가 액션
            if (this.isTransitioningToGarden) {
                console.log('Reached garden door, starting transition to garden...');
                this.startGardenTransition();
            }
        }
    }

    // --- GardenScene으로 전환하는 함수 (분리) ---
    startGardenTransition() {
        console.log('Starting transition to Garden...');
        this.cameras.main.fadeOut(500, 0, 0, 0, (camera, progress) => {
            if (progress === 1) {
                // GardenScene으로 전환
                const entryDoorGridCol = Math.floor(this.gridWidth / 2); // Garden 문 위치 가정
                const entryDoorGridRow = 1; // Garden 문의 위치 가정
                
                // GardenScene 인스턴스 생성 전 참조
                const gardenScene = this.scene.get('GardenScene');
                // 시간 정보 전달 (씬이 생성되었다면)
                if (gardenScene) {
                    this.passTimeToNextScene(gardenScene);
                }
                
                this.scene.start('GardenScene', { 
                    arrivingAt: 'entryDoor',
                    targetGridCol: entryDoorGridCol,
                    targetGridRow: entryDoorGridRow 
                });
            }
        });
    }
    // -------------------------------------------
} 