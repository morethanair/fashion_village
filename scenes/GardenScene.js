// import Phaser from 'phaser'; // Removed as Phaser is loaded globally
import BaseScene from './BaseScene.js';
import PlantManager from './PlantManager.js';
import CatManager from './CatManager.js';

export default class GardenScene extends BaseScene {
    constructor() {
        super({ key: 'GardenScene' });
        this.player = null;
        this.targetPosition = null;
        this.entryDoor = null;
        this.isTransitioningToHome = false;
        this.arrivalData = null;
        this.isPlantingMode = false;
        this.seeds = null;
        this.isMovingToPlant = false;
        this.isMovingToWater = false;
        this.targetSeed = null;
        this.isMovingToCat = false;

        this.plantManager = null; // PlantManager 인스턴스 참조
        this.catManager = null; // CatManager 인스턴스 참조

        // Grid Config & Pathfinding
        this.tileSize = 32;
        this.occupiedCells = new Set();
        this.easystar = null;
        this.movePath = null;
        this.movePathIndex = -1;
        this.isCalculatingPath = false;
        console.log(`Grid initialized with default values. Tile size: ${this.tileSize}px`);
    }

    // init 메소드 추가: Scene 시작 시 데이터 수신
    init(data) {
        console.log('GardenScene init data:', data);
        this.arrivalData = data; // 도착 데이터 저장
    }

    preload() {
        // 필요한 이미지 로드 (BaseScene에서 처리하지 않는 것들)
        this.load.on('loaderror', (fileObj) => {
            console.error('Error loading asset:', fileObj.key, fileObj.src);
        });
        this.load.image('tiles', 'assets/tiles/grass_tile.png');
        this.load.image('wall', 'assets/tiles/wall.png');
        this.load.image('door', 'assets/sprites/door.png');
        this.load.image('player', 'assets/sprites/player.png');
        this.load.image('seed', 'assets/sprites/seed.png');
        this.load.image('sprout', 'assets/sprites/sprout.png');
        this.load.image('plant', 'assets/sprites/plant.png');
        this.load.image('big_plant', 'assets/sprites/big_plant.png');
        this.load.image('flower_plant', 'assets/sprites/flower_plant.png');
        this.load.image('cat', 'assets/sprites/cat.png');
        this.load.image('stone', 'assets/sprites/stone.png');
    }

    create() {
        console.log("GardenScene create");
        super.create(); // BaseScene의 create 호출 (UI, 시간 등)

        // --- 게임 상태 로드 또는 초기화 (occupiedCells 포함) ---
        let gardenState = this.registry.get('gardenState');
        if (!gardenState) {
            console.log("No existing garden state found. Initializing.");
            gardenState = {
                plants: [],
                occupiedCells: {}, // 객체로 저장
                stones: []
            };
            this.registry.set('gardenState', gardenState);
            this.occupiedCells = new Set();
        } else {
            console.log("Loading existing garden state from registry.");
            this.occupiedCells = new Set(Object.keys(gardenState.occupiedCells || {}));
            if (!gardenState.stones) gardenState.stones = [];
        }
        console.log("Garden state loaded/initialized. Occupied cells count:", this.occupiedCells.size);
        // ----------------------------------

        // --- Tilemap 및 초기 장애물 설정 ---
        const map = this.setupTilemap(); // Tilemap 설정 (헬퍼 함수 사용 가정)
        this.setupInitialObstacles(map); // 벽, 문 등 초기 장애물 설정
        // ---------------------------------

        // --- EasyStar 초기화 ---
        const gridData = this.createGridDataFromOccupiedCells(); // occupiedCells 기반 그리드 데이터 생성
        this.initializeEasyStar(gridData, false); // BaseScene의 초기화 함수 사용
        console.log('EasyStar initialized based on initial obstacles.');
        // ---------------------

        // --- 매니저 초기화 ---
        this.plantManager = new PlantManager(this, this.registry, this.occupiedCells, this.easystar);
        this.catManager = new CatManager(this, this.registry, this.occupiedCells, this.easystar);
        console.log("PlantManager and CatManager instances created.");
        // ---------------------

        // --- 기존 객체 로드 (매니저에게 위임) ---
        this.plantManager.loadPlants(); // 저장된 식물 로드 (내부적으로 easystar 업데이트)
        this.setupStones(gardenState.stones); // 저장된 돌 로드 (easystar 업데이트)
        // ------------------------------------

        // --- 플레이어 생성 ---
        // 시작 위치 계산 로직
        let initialGridCol = Math.floor(this.gridWidth / 2);
        let initialGridRow = Math.floor(this.gridHeight / 2);
        if (this.arrivalData?.arrivingAt === 'entryDoor') {
            initialGridCol = Math.floor(this.gridWidth / 2);
            initialGridRow = 2; // 문 아래 셀 (doorGridRow + 1)
        }
        // BaseScene의 createPlayer 호출
        this.player = this.createPlayer(initialGridCol, initialGridRow);
        if (!this.player) {
            console.error("GardenScene: Failed to create player!");
            return; // 플레이어 생성 실패 시 중단
        }
        this.plantManager.setPlayer(this.player);
        // CatManager는 내부적으로 this.scene.player를 참조하므로 별도 설정 불필요
        console.log(`GardenScene: Player created via BaseScene at grid [${initialGridCol}, ${initialGridRow}]`);
        // ---------------------

        // --- 고양이 생성 및 스폰 시작 (CatManager에게 위임) ---
        this.catManager.createCat();
        this.catManager.startSpawning();
        // ------------------------------------------------

        // --- 입력 설정 ---
        this.setupInputHandlers();
        // -----------------

        console.log("GardenScene setup complete.");
    }

    // --- Setup Helper Methods ---
    setupTilemap() {
        // Tilemap 생성 및 레이어 설정 로직
        const map = this.make.tilemap({ tileWidth: this.tileSize, tileHeight: this.tileSize, width: this.gridWidth, height: this.gridHeight });
        const tileset = map.addTilesetImage('tiles', 'tiles', this.tileSize, this.tileSize, 0, 0);
        const wallTileset = map.addTilesetImage('wall', 'wall', this.tileSize, this.tileSize, 0, 0);

        if (!tileset || !wallTileset) {
            console.error("Failed to add tilesets.");
            return null;
        }
        const groundLayer = map.createBlankLayer('ground', tileset, 0, this.uiHeight); 
        const wallLayer = map.createBlankLayer('wall', wallTileset, 0, this.uiHeight);
        if (!groundLayer || !wallLayer) {
             console.error("Failed to create layers.");
             return null;
        }
        groundLayer.fill(0);
        wallLayer.setDepth(0);
        return map; // map 객체 반환
    }

    setupInitialObstacles(map) {
        if (!map) return;
        const wallLayer = map.getLayer('wall')?.tilemapLayer; // 정확한 레이어 가져오기
        if (!wallLayer) return;

        const doorGridCol = Math.floor(this.gridWidth / 2);
        for (let col = 0; col < this.gridWidth; col++) {
            if (col === doorGridCol) continue;
            for (let row = 0; row <= 1; row++) { // 상단 2줄 벽
                wallLayer.putTileAt(0, col, row);
                const cellKey = `${col},${row}`;
                this.occupiedCells.add(cellKey);
            }
        }
        // 문 생성
        this.createDoor();
    }

    createGridDataFromOccupiedCells() {
         const gridData = [];
         for (let y = 0; y < this.gridHeight; y++) {
             const row = [];
             for (let x = 0; x < this.gridWidth; x++) {
                 const cellKey = `${x},${y}`;
                 row.push(this.occupiedCells.has(cellKey) ? 1 : 0);
             }
             gridData.push(row);
         }
         return gridData;
    }

    setupStones(savedStones = []) {
        // 저장된 돌 또는 기본 위치에 돌 생성 로직
        // 예시: 기본 돌 위치
        const defaultStones = [
            { col: 3, row: 5 }, { col: 8, row: 8 }, { col: 12, row: 4 }
        ];
        const stonesToCreate = savedStones.length > 0 ? savedStones : defaultStones;

        stonesToCreate.forEach(stonePos => {
            const worldPos = this.gridToWorld(stonePos.col, stonePos.row);
            const stoneSprite = this.add.sprite(worldPos.x, worldPos.y, 'stone').setOrigin(0.5);
            const cellKey = `${stonePos.col},${stonePos.row}`;
            if (!this.occupiedCells.has(cellKey)) {
                this.occupiedCells.add(cellKey);
                if (this.easystar) {
                    try { this.easystar.avoidAdditionalPoint(stonePos.col, stonePos.row); }
                    catch (e) { console.error("Easystar error adding stone obstacle:", e); }
                }
                console.log(`Stone placed and obstacle set at [${stonePos.col}, ${stonePos.row}]`);
            } else {
                console.warn(`Attempted to place stone on occupied cell [${stonePos.col}, ${stonePos.row}]`);
            }
        });

        // 현재 돌 위치 저장 (gardenState 업데이트)
        const gardenState = this.registry.get('gardenState');
        if (gardenState && savedStones.length === 0) { // 저장된 정보가 없었고 기본값 사용 시
            gardenState.stones = stonesToCreate.map(p => ({ col: p.col, row: p.row }));
            // occupiedCells는 이미 위에서 추가됨
            stonesToCreate.forEach(p => gardenState.occupiedCells[`${p.col},${p.row}`] = true);
            this.registry.set('gardenState', gardenState);
            console.log("Default stone positions saved to registry.");
        }
    }

    createDoor() {
        const doorGridCol = Math.floor(this.gridWidth / 2);
        const doorGridRow = 1; // 문이 위치할 행 (벽과 같은 행)
        const doorWorldPos = this.gridToWorld(doorGridCol, doorGridRow);

        // 원점을 (0.5, 1)로 설정하고 y 좌표 조정하여 문 바닥을 셀 바닥에 맞춤
        this.entryDoor = this.add.sprite(doorWorldPos.x, doorWorldPos.y + this.tileSize / 2, 'door').setOrigin(0.5, 1);

        // 상호작용 설정 추가
        this.entryDoor.setInteractive({ useHandCursor: true });

        console.log(`Door created at grid [${doorGridCol}, ${doorGridRow}] with bottom origin and interaction`);
    }

    setupInputHandlers() {
        // 롱클릭/숏클릭 관련 변수
        let pointerDownTime = 0;
        let longClickTimer = null;
        const longClickDuration = 500; // 롱클릭 간주 시간 (ms)
        let isLongClick = false;

        // 클릭 이벤트 핸들러
        this.input.off('pointerdown'); // 기존 핸들러 제거
        this.input.off('pointerup');   // 기존 핸들러 제거

        this.input.on('pointerdown', (pointer) => {
            if (pointer.y < this.uiHeight) return; // UI 클릭 무시

            pointerDownTime = this.time.now;
            isLongClick = false;

            // 롱클릭 타이머 설정
            longClickTimer = this.time.delayedCall(longClickDuration, () => {
                isLongClick = true;
                const targetGrid = this.worldToGrid(pointer.worldX, pointer.worldY);
                console.log(`Long click detected at grid [${targetGrid.col}, ${targetGrid.row}]`);
                this.handleLongClick(targetGrid);
            });
        });

        this.input.on('pointerup', (pointer) => {
            if (pointer.y < this.uiHeight) return;

            // 롱클릭 타이머 해제
            if (longClickTimer) {
                longClickTimer.remove();
                longClickTimer = null;
            }

            // 롱클릭이 아니었다면 숏클릭 처리
            if (!isLongClick) {
                const timeDiff = this.time.now - pointerDownTime;
                console.log(`Short click detected (duration: ${timeDiff}ms)`);
                const targetGrid = this.worldToGrid(pointer.worldX, pointer.worldY);
                // handleShortClick 호출 시 event 객체 전달 추가
                this.handleShortClick(targetGrid, pointer, event);
            }
        });

        // --- 키 입력 설정 ---
        // this.input.keyboard.off('keydown-P'); ... (P 키 로직 제거됨)

        // 디버그 키 (BaseScene에서 공통으로 처리 가능하면 이동)
        this.input.keyboard.off('keydown-S');
        this.input.keyboard.on('keydown-S', () => {
             console.log("Saving game state via S key...");
             if (this.plantManager) this.plantManager.savePlants();
             // CatManager는 저장할 상태가 현재 없음
             // gardenState의 occupiedCells는 PlantManager/돌 등에서 이미 업데이트됨
             const finalState = this.registry.get('gardenState');
             this.registry.set('gardenState', finalState); // 명시적 저장 호출
             console.log("Garden state explicitly saved.", finalState);
             this.showTemporaryMessage("게임 상태 저장됨", 1500);
         });

        this.input.keyboard.off('keydown-R');
        this.input.keyboard.on('keydown-R', () => {
             console.warn("Resetting garden state via R key...");
             this.registry.set('gardenState', null); // 상태 삭제
             this.scene.restart(); // 씬 재시작하여 초기 상태로
         });
    }

    // --- 롱클릭 처리 함수 ---
    handleLongClick(targetGrid) {
        console.log(`Handling long click for planting at [${targetGrid.col}, ${targetGrid.row}]`);
        // 비어 있는 땅인지 확인 (PlantManager가 처리하도록 위임 가능)
        const cellKey = `${targetGrid.col},${targetGrid.row}`;
                if (this.occupiedCells.has(cellKey)) {
            console.log(`Cell [${targetGrid.col}, ${targetGrid.row}] is occupied, cannot plant.`);
            this.showTemporaryMessage("여기에 심을 수 없어요.", 1500);
            return;
        }

        // PlantManager에 심기 요청
        if (this.plantManager) {
            this.plantManager.requestPlanting(targetGrid);
        }
    }

    // --- 숏클릭 처리 함수 ---
    handleShortClick(targetGrid, pointer, event) {
        console.log(`Handling short click at grid [${targetGrid.col}, ${targetGrid.row}]`);

        // --- 문 클릭 및 주변 처리 ---
        const doorGridCol = Math.floor(this.gridWidth / 2);
        const doorGridRow = 1;
        const doorEntranceGrid = { col: doorGridCol, row: doorGridRow + 1 };
        if (targetGrid.col === doorGridCol && (targetGrid.row === doorGridRow || targetGrid.row === doorEntranceGrid.row)) {
            console.log('Short click near door area.');
            const playerGrid = this.worldToGrid(this.player.x, this.player.y);
            if (playerGrid.col === doorEntranceGrid.col && playerGrid.row === doorEntranceGrid.row) {
                this.disableAllMovementFlags();
                this.isTransitioningToHome = true;
                this.startHomeTransition();
            } else {
                this.disableAllMovementFlags();
                this.isTransitioningToHome = true;
                this.moveToGridCell(doorEntranceGrid.col, doorEntranceGrid.row, (pathFound) => {
                    if (!pathFound) this.isTransitioningToHome = false;
                });
            }
            return;
        }
        // ------------------------

        // --- 고양이 클릭 처리 ---
        if (this.catManager && this.catManager.handlePointerDown(pointer, event)) {
            console.log("Short click handled by CatManager.");
            return;
        }
        // ------------------------

        // --- 식물 클릭 처리 확인 (실제 처리는 PlantManager의 리스너가 함) ---
        if (this.plantManager && this.plantManager.getPlantAt(targetGrid.col, targetGrid.row)) {
            console.log("Short click on a plant detected, handled by plant's own listener.");
            // PlantManager의 _setupPlantClickListener -> _handleExistingPlantClick 에서 처리하므로
            // 여기서는 추가 작업 없이 종료 (중복 이동 방지)
            return;
        }
        // -----------------------------------------------------------------

        // --- 일반 이동 처리 ---
        console.log(`Handling short click as general movement to grid [${targetGrid.col}, ${targetGrid.row}]...`);
        this.disableAllMovementFlags();
        this.moveToGridCell(targetGrid.col, targetGrid.row, (pathFound) => {
            if (!pathFound) console.log(`No path to [${targetGrid.col}, ${targetGrid.row}] found`);
        });
        // -------------------
    }

    // --- 플레이어 이동 관련 함수들 (BaseScene에서 상속/사용) ---
    // moveToGridCell, updatePathMovement 등은 BaseScene에 있을 수 있음
    // 여기서는 이동 완료 후 매니저 호출 부분만 확인/수정

    update(time, delta) {
        super.update(time, delta); // BaseScene의 update 호출

        // 경로 따라 이동 업데이트 (BaseScene의 것을 사용)
        const pathEndReached = this.updatePathMovement(time, delta);

        if(pathEndReached) {
            // 이동 완료 시 최종 그리드 위치 확인
            const finalGrid = this.worldToGrid(this.player.x, this.player.y);
            console.log(`Movement finished at grid [${finalGrid.col}, ${finalGrid.row}]`);

            // 도착 알림 처리 (매니저 호출)
            let handledByManager = false;
            if (this.plantManager) {
                 handledByManager = this.plantManager.handlePathMovementEnd(finalGrid);
                 if (handledByManager) console.log("Path end handled by PlantManager.");
            }
            if (!handledByManager && this.catManager) { // PlantManager가 처리 안했을 때만 CatManager 호출
                handledByManager = this.catManager.handlePathMovementEnd(finalGrid);
                if (handledByManager) console.log("Path end handled by CatManager.");
            }

            // 문 전환 로직
            if (!handledByManager && this.isTransitioningToHome) {
                 const doorGridCol = Math.floor(this.gridWidth / 2);
                 const doorEntranceRow = 2; // 문 아래 칸
                 if (finalGrid.col === doorGridCol && finalGrid.row === doorEntranceRow) {
                console.log('Player reached the door cell, starting transition to Home...');
                this.startHomeTransition();
            } else {
                     console.log('Reached destination, but not the door for transition.');
                     this.isTransitioningToHome = false; // 문이 아니면 전환 취소
                 }
            }

            // 모든 매니저가 처리하지 않았고, 특별한 상태(문 전환 등)가 아닌 일반 이동 완료
            if (!handledByManager && !this.isTransitioningToHome) {
                 console.log('General movement path finished.');
            }

            // 이동 완료 후 모든 관련 플래그 초기화 (중요)
            this.disableAllMovementFlags();
            this.isCalculatingPath = false;
        }

        // 매니저 업데이트
        if (this.plantManager) this.plantManager.update(time, delta);
        if (this.catManager) this.catManager.update(time, delta);
    }

    // --- 기타 헬퍼 함수 ---
    disableAllMovementFlags() {
        this.isTransitioningToHome = false;
        // 매니저들의 상태 비활성화 호출
        if (this.plantManager) {
            this.plantManager.disablePlantingMovement();
            // 다른 식물 관련 이동 플래그 비활성화 (예: 물주기)
            this.plantManager.isMovingToWater = false;
            this.plantManager.interactionTargetPlant = null;
        }
        if (this.catManager) {
            this.catManager.disableCatMovement();
        }
        this.targetSeed = null; // 레거시 호환용 (제거 예정)
        this.plantingTargetGrid = null; // 레거시 호환용 (제거 예정)
        console.log("All special movement flags disabled by GardenScene.");
    }

    startHomeTransition() {
        if (!this.isTransitioningToHome) return; // 의도치 않은 호출 방지
        console.log('Starting transition to HomeScene...');
        // 페이드 아웃 등 전환 효과 추가 가능
        // HomeScene이 GardenScene에서 왔고, 특정 지점(출구 문)에 도착해야 함을 알림
        this.scene.start('HomeScene', { arrivingAt: 'exitDoor' });
    }

    // --- 제거된 함수들 ---
    // trySpawnCat() { ... }
    // hideCat() { ... }
} 