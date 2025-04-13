import BaseScene from './BaseScene.js';

export default class GardenScene extends BaseScene {
    constructor() {
        super({ key: 'GardenScene' });
        this.player = null; // 플레이어 객체 (이제 컨테이너가 됨)
        this.targetPosition = null; // 목표 위치를 저장할 속성
        this.entryDoor = null; // 문 객체 참조 추가
        this.isTransitioningToHome = false; // 전환 플래그 추가
        this.arrivalData = null; // 도착 정보 저장 변수
        this.isPlantingMode = false; // 심기 모드 플래그 추가
        this.seeds = null; // 씨앗 그룹 추가
        this.isMovingToPlant = false; // 씨앗 심으러 이동 중인지 플래그 추가
        this.isMovingToWater = false;
        this.targetSeed = null;
        this.isMovingToCat = false; // 고양이에게 이동 중 플래그 추가

        // Cat Variables
        this.cat = null;
        this.catSpawnTimer = null;
        this.catStayTimer = null;
        this.catSpawnProbability = 0.5; // 50% 확률로 등장 (테스트용)

        // Planting Config
        this.minPlantDistance = 30; // 그리드 시스템에서는 사용 안 함 (주석 처리 또는 제거)
        this.plantingTargetGrid = null; // 심을 목표 그리드 셀 임시 저장

        // Grid Config - BaseScene에서 상속받음
        this.tileSize = 32;
        // gridWidth와 gridHeight는 BaseScene에서 상속받음
        this.occupiedCells = new Set(); // Scene 내에서의 빠른 조회를 위해 유지
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
        // BaseScene의 preload 호출 제거 (BaseScene에 preload 메서드가 없음)
        
        // 이미지 로드 오류 핸들러 추가
        this.load.on('loaderror', (fileObj) => {
            console.error('Error loading asset:', fileObj.key, fileObj.src);
        });
        
        // 이미지 로드 성공 핸들러 (flower_plant 확인용)
        this.load.on('filecomplete-image-flower_plant', () => {
            console.log('flower_plant.png successfully loaded!');
        });
        
        // 필요한 이미지 로드 (정원 타일, 문, 씨앗, 식물 등)
        this.load.image('tiles', 'assets/tiles/grass_tile.png'); // 타일셋 이미지 로드 - 원래 파일명으로 복원
        this.load.image('wall', 'assets/tiles/wall.png');   // 벽 타일 이미지 로드
        this.load.image('door', 'assets/sprites/door.png'); // 문 이미지 로드
        this.load.image('player', 'assets/sprites/player.png'); // 플레이어 스프라이트 로드
        this.load.image('seed', 'assets/sprites/seed.png'); // 씨앗 이미지 로드
        this.load.image('sprout', 'assets/sprites/sprout.png'); // 새싹 이미지 로드
        this.load.image('plant', 'assets/sprites/plant.png'); // 작은 식물 이미지 로드 (small_plant 대신)
        this.load.image('big_plant', 'assets/sprites/big_plant.png'); // 큰 식물 이미지 로드
        
        // 특별히 체크하기 위해 별도로 로드
        console.log('Trying to load flower_plant.png...');
        this.load.image('flower_plant', 'assets/sprites/flower_plant.png'); // 꽃이 핀 식물 이미지 로드
        
        this.load.image('cat', 'assets/sprites/cat.png'); // 고양이 이미지 로드
        this.load.image('stone', 'assets/sprites/stone.png'); // 바위 이미지 로드
    }

    create() {
        console.log("GardenScene create");
        
        // BaseScene의 create 메서드 호출 (UI 및 시간 초기화)
        super.create();
        
        // 카메라 배경색은 BaseScene에서 설정되므로 제거
        // this.cameras.main.setBackgroundColor('#90EE90');

        // 물리 경계 명시적 설정 (UI 영역 아래에서부터 시작)
        this.physics.world.setBounds(
            0, this.uiHeight, 
            this.cameras.main.width, 
            this.cameras.main.height - this.uiHeight
        );
        console.log(`Physics world bounds set: x=0, y=${this.uiHeight}, w=${this.cameras.main.width}, h=${this.cameras.main.height - this.uiHeight}`);

        // --- 게임 상태 로드 또는 초기화 ---
        let gardenState = this.registry.get('gardenState');
        if (!gardenState) {
            console.log("No existing garden state found. Initializing.");
            gardenState = {
                plants: [], // { gridCol, gridRow, type, stage, plantedTime, lastWatered, lastGrowthTime, lastGrowthDay }
                occupiedCells: {} // Using an object for Set serialization: { "col,row": true }
            };
            this.registry.set('gardenState', gardenState);
            this.occupiedCells = new Set(); // Initialize local set
        } else {
            console.log("Loading existing garden state from registry.");
            // Registry의 occupiedCells 객체를 로컬 Set으로 변환
            this.occupiedCells = new Set(Object.keys(gardenState.occupiedCells));
        }
        // ----------------------------------

        // --- EasyStar 초기화 및 장애물 설정 ---
        const gridData = [];
        for(let y = 0; y < this.gridHeight; y++){
            const row = [];
            for(let x = 0; x < this.gridWidth; x++){
                 // Registry 상태 기반으로 장애물 설정 (0: 이동가능, 1: 이동불가)
                const cellKey = `${x},${y}`;
                const isOccupied = gardenState.occupiedCells[cellKey];
                row.push(isOccupied ? 1 : 0); 
            }
            gridData.push(row);
        }
        
        // BaseScene의 초기화 함수 사용, 대각선 이동 비활성화
        this.initializeEasyStar(gridData, false);
        
        // 식물이 심어진 셀을 모두 장애물로 등록
        gardenState.plants.forEach(plant => {
            try {
                this.easystar.avoidAdditionalPoint(plant.gridCol, plant.gridRow);
            } catch (e) {
                console.error(`Error avoiding point [${plant.gridCol},${plant.gridRow}]:`, e);
            }
        });
        
        console.log('EasyStar initialized with grid data based on registry.');
        // ------------------------------------

        // --- 기존 식물들 복원 ---
        this.seeds = this.add.group();
        gardenState.plants.forEach(plantData => {
            // 식물 위치를 월드 좌표로 변환
            const plantWorldPos = this.gridToWorld(plantData.gridCol, plantData.gridRow);
            
            // 식물 스프라이트 생성
            let texture = 'seed'; // 기본은 씨앗
            
            // 성장 단계에 따라 다른 텍스처 사용
            switch (plantData.stage) {
                case 0: texture = 'seed'; break;
                case 1: texture = 'sprout'; break;
                case 2: texture = 'plant'; break; // small_plant 대신 plant 사용
                case 3: texture = 'big_plant'; break;
                case 4: 
                    texture = 'flower_plant'; 
                    console.log('Loading flower_plant from registry for plant at', plantData.gridCol, plantData.gridRow);
                    break;
            }
            
            const seedSprite = this.add.sprite(plantWorldPos.x, plantWorldPos.y, texture);
            
            // Stage 4(꽃이 핀 식물)인 경우 특별 처리
            if (plantData.stage === 4) {
                seedSprite.clearTint();
                seedSprite.setScale(1);
                console.log('Applied special handling for flower_plant texture');
            }
            
            seedSprite.setData('plantData', plantData);
            seedSprite.setInteractive({ useHandCursor: true });
            this.seeds.add(seedSprite);
            
            // 씨앗 클릭 리스너 설정
            this.setupSeedClickListener(seedSprite);
            
            // 식물이 심어진 셀을 점유 상태로 등록
            const cellKey = `${plantData.gridCol},${plantData.gridRow}`;
            this.occupiedCells.add(cellKey);
            
            // A* 알고리즘에도 장애물로 등록
            this.easystar.avoidAdditionalPoint(plantData.gridCol, plantData.gridRow);
            
            console.log(`Loaded plant from registry at [${plantData.gridCol}, ${plantData.gridRow}], stage: ${plantData.stage}`);
        });
        console.log(`Loaded ${gardenState.plants.length} plants from registry.`);
        // -----------------------------------------

        // --- 그리드 시각화 제거 ---
        // this.drawGrid(); 
        // -----------------------

        // --- Tilemap 생성 및 설정 ---
        // 참고: 타일맵의 높이/너비는 물리 세계와 일치하도록 설정
        const map = this.make.tilemap({ 
            tileWidth: this.tileSize, 
            tileHeight: this.tileSize, 
            width: this.gridWidth, 
            height: this.gridHeight
        });
        
        // 타일셋 추가: 'tiles'는 preload에서 로드한 이미지 키, 'tileset'은 타일맵 내에서의 이름
        const tileset = map.addTilesetImage('tiles', 'tiles', this.tileSize, this.tileSize, 0, 0); // 마지막 0, 0은 margin, spacing
        const wallTileset = map.addTilesetImage('wall', 'wall', this.tileSize, this.tileSize, 0, 0);

        if (!tileset || !wallTileset) {
             console.error("Tileset could not be added. Check image key and path in preload.");
             return; // 타일셋 로드 실패 시 중단
        }

        // 레이어 생성: 위치를 UI 영역 아래로 조정
        const groundLayer = map.createBlankLayer('ground', tileset, 0, this.uiHeight); 
        if (!groundLayer) {
             console.error("Ground layer could not be created.");
             return; // 레이어 생성 실패 시 중단
        }
        
        // 전체 레이어를 잔디 타일(인덱스 0)로 채우기
        groundLayer.fill(0); // tileset에서 첫 번째 타일의 인덱스는 0
        
        // 벽 레이어 생성
        const wallLayer = map.createBlankLayer('wall', wallTileset, 0, this.uiHeight);
        if (!wallLayer) {
            console.error("Wall layer could not be created.");
            return;
        }
        wallLayer.setDepth(0); // groundLayer보다 위에 보이도록
        
        // 문 위치 (문의 *하단 중앙*이 해당 셀 중앙에 오도록)
        const doorGridCol = Math.floor(this.gridWidth / 2);
        const doorGridRow = 1; // 문이 위치할 최상단 행
        
        // 상단 0번, 1번 row에 문이 있는 column을 제외하고 벽 타일로 채우기
        for (let col = 0; col < this.gridWidth; col++) {
            // 문이 있는 column은 건너뛰기
            if (col === doorGridCol) continue;
            
            // 0번 row 채우기
            wallLayer.putTileAt(0, col, 0);
            // 1번 row 채우기
            wallLayer.putTileAt(0, col, 1);
            
            // 물리적 충돌 설정 (필요시)
            // 이 그리드 위치에 EasyStar 장애물 설정
            this.easystar.avoidAdditionalPoint(col, 0);
            this.easystar.avoidAdditionalPoint(col, 1);
            
            // 이 셀들을 점유된 것으로 표시
            const cellKey0 = `${col},0`;
            const cellKey1 = `${col},1`;
            this.occupiedCells.add(cellKey0);
            this.occupiedCells.add(cellKey1);
            
            // Registry 저장용 상태에도 추가
            let gardenState = this.registry.get('gardenState');
            gardenState.occupiedCells[cellKey0] = true;
            gardenState.occupiedCells[cellKey1] = true;
            this.registry.set('gardenState', gardenState);
        }
        
        // 가장 하단 행에도 벽 타일 추가 (연두색 띠와 검은 픽셀 문제 해결)
        const veryBottomRow = this.gridHeight;
        for (let col = 0; col < this.gridWidth; col++) {
            // 맨 아래 행에 벽 타일 설치
            wallLayer.putTileAt(0, col, veryBottomRow);
        }
        
        // 레이어 깊이 설정 (플레이어 등 다른 객체보다 뒤에)
        groundLayer.setDepth(-1);

        console.log('Tilemap, ground layer, and wall layer created');
        // ---------------------------

        const doorWorldPos = this.gridToWorld(doorGridCol, doorGridRow);

        // 시작 위치 결정 (도착 정보가 있다면 문 근처 그리드 셀, 아니면 중앙 근처 그리드 셀)
        let initialGridCol = Math.floor(this.gridWidth / 2);
        let initialGridRow = Math.floor(this.gridHeight / 2);
        if (this.arrivalData?.arrivingAt === 'entryDoor') {
            initialGridCol = doorGridCol;
            initialGridRow = doorGridRow + 1; // 문 바로 아래 셀
            console.log('Arriving from Home, starting near entry door grid cell.');
        } else {
            console.log('Starting GardenScene fresh or from unknown, near center grid cell.');
        }
        const initialWorldPos = this.gridToWorld(initialGridCol, initialGridRow);
        console.log(`Player starting world pos: ${initialWorldPos.x}, ${initialWorldPos.y}`);

        // --- 플레이어 생성 (Sprite 사용) ---
        this.player = this.physics.add.sprite(initialWorldPos.x, initialWorldPos.y, 'player');
        // 물리 몸체 크기/위치 조절 (필요시)
        // this.player.body.setSize(width, height).setOffset(x, y);
        if (this.player.body) {
            this.player.body.setCollideWorldBounds(true);
            console.log('Player physics sprite enabled.');
        } else {
            console.error('Failed to enable physics on player sprite!'); return;
        }
        this.player.setInteractive({ useHandCursor: true }); // 플레이어 클릭은 유지 (모드 토글은 키보드로 변경됨)
        console.log('Player sprite created and configured');
        // --------------------------------

        // 플레이어 클릭 시: 이동 멈추기만 (모드 토글 로직은 제거됨)
        this.player.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            if(this.player.body) this.player.body.stop();
            this.movePath = null; // 경로 이동 중단
            this.movePathIndex = -1;
            console.log('Player clicked, stopped movement.');
            // 키보드 모드 토글 사용하므로 플레이어 클릭은 이동 중단 외 특별 동작 없음
        });

        // --- 문 생성 (Sprite 사용) ---
        // 문의 원점(origin)을 하단 중앙(0.5, 1)으로 설정하여 doorWorldPos에 맞춤
        this.entryDoor = this.add.sprite(doorWorldPos.x, doorWorldPos.y + this.tileSize/2, 'door').setOrigin(0.5, 1);
        // 클릭 영역 설정 (문의 실제 크기)
        this.entryDoor.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.entryDoor.width, this.entryDoor.height), Phaser.Geom.Rectangle.Contains);
        this.entryDoor.input.cursor = 'pointer';
        // 문 클릭 -> 문 아래 셀로 이동
        this.entryDoor.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            console.log('Door clicked, checking player position...');
            this.isTransitioningToHome = true;
            this.isMovingToPlant = false; // 다른 이동 상태 초기화
            this.isMovingToWater = false;
            this.isMovingToCat = false;
            
            // 플레이어가 이미 문 근처에 있는지 확인
            const playerGrid = this.worldToGrid(this.player.x, this.player.y);
            const doorGridCol = Math.floor(this.gridWidth / 2);
            const doorGridRow = 1;
            const doorTargetRow = doorGridRow + 1;
            
            // 플레이어가 문과 같은 셀 또는 인접 셀에 있는지 확인
            const atDoor = playerGrid.col === doorGridCol && playerGrid.row === doorGridRow;
            const atDoorEntrance = playerGrid.col === doorGridCol && playerGrid.row === doorTargetRow;
            
            // 플레이어가 문 또는 문 인접 셀에 있으면 바로 이동 트리거
            if (atDoor || atDoorEntrance) {
                console.log(`Player already at door or entrance [${doorGridCol}, ${doorTargetRow}], transitioning immediately...`);
                // 즉시 이동 트리거
                this.startHomeTransition();
            } else {
                // 아니면 경로 탐색 후 이동
                console.log(`Player not adjacent to door, finding path to [${doorGridCol}, ${doorTargetRow}]...`);
                this.moveToGridCell(doorGridCol, doorTargetRow, (pathFound) => {
                    if (!pathFound) {
                        console.log('No path to door found');
                        this.isTransitioningToHome = false;
                    }
                });
            }
        });
        console.log('Door sprite created');
        // -----------------------------

        // --- 고양이 객체 생성 (Sprite 사용) ---
        this.cat = this.add.sprite(-100, -100, 'cat'); // 초기 위치 화면 밖
        this.cat.setSize(32, 32); // 클릭 영역 설정 (예시)
        this.cat.setVisible(false);
        this.cat.setInteractive({ useHandCursor: true });
        console.log('Cat sprite created and hidden');
        // 고양이 클릭 리스너 (이전과 동일, moveToGridCell 호출)
        this.cat.on('pointerdown', (pointer, localX, localY, event) => {
            if (this.cat.visible) {
                event.stopPropagation();
                const catData = this.cat.data.values;
                const catCol = catData.gridCol;
                const catRow = catData.gridRow;
                console.log(`고양이 [${catCol}, ${catRow}] 클릭. 플레이어 위치 확인...`);
                
                // 플레이어의 현재 위치 확인
                const playerGrid = this.worldToGrid(this.player.x, this.player.y);
                
                // 플레이어가 고양이와의 거리 계산 (맨해튼 거리)
                // 0: 플레이어가 고양이 셀에 있음
                // 1: 인접한 셀에 있음
                // >1: 멀리 있음
                const manhattanDistance = Math.abs(playerGrid.col - catCol) + Math.abs(playerGrid.row - catRow);
                
                // 플레이어가 고양이 위에 있거나 인접해 있으면 바로 상호작용
                if (manhattanDistance <= 1) {
                    // 이미 고양이 셀에 있거나 인접해 있으므로 바로 상호작용
                    console.log(`Player at or adjacent to cat at [${catCol}, ${catRow}], interacting directly...`);
                    
                    // 말풍선 생성 및 표시
                    this.createSpeechBubble(this.cat.x, this.cat.y - this.cat.height / 2 - 5, "야옹! 선물을 받아라냥!");
                    
                    // 잠시 후 고양이 숨기고 상태 초기화
                    this.time.delayedCall(2100, () => { // 말풍선 지속시간보다 약간 길게
                        this.hideCat(); 
                        console.log('선물 획득! (임시)'); 
                        // TODO: 실제 선물 획득 로직
                    });
                    return;
                }

                // 인접하지 않은 경우 인접 셀로 이동
                console.log(`인접 셀 탐색...`);
                const adjacentCell = this.findWalkableAdjacentCell(catCol, catRow);

                if (adjacentCell) {
                    console.log(`인접 이동 가능 셀 [${adjacentCell.col}, ${adjacentCell.row}] 발견. 경로 탐색...`);
                    this.isMovingToCat = true;
                    this.isMovingToPlant = false;
                    this.isMovingToWater = false;
                    this.isTransitioningToHome = false;
                    this.moveToGridCell(adjacentCell.col, adjacentCell.row, (pathFound) => {
                        if (!pathFound) {
                            console.log('No path to cat found');
                            this.isMovingToCat = false;
                        }
                    });
                } else {
                    console.log(`고양이 [${catCol}, ${catRow}] 주변에 접근 가능한 셀이 없습니다.`);
                    // TODO: 화면 메시지
                }
            }
        });
        // ------------------------------------

        // Scene 클릭 리스너
        this.input.on('pointerdown', (pointer) => {
            const targetGrid = this.worldToGrid(pointer.worldX, pointer.worldY);
            
            // 문 주변 클릭 체크 (문 클릭 자체는 문 이벤트 핸들러에서 처리)
            const doorGridCol = Math.floor(this.gridWidth / 2);
            const doorGridRow = 1;
            const doorTargetRow = doorGridRow + 1;
            
            // 문이나 문 바로 아래 셀 근처를 클릭했는지 확인 (맨해튼 거리 사용)
            const manhattanDistance = Math.abs(targetGrid.col - doorGridCol) + Math.abs(targetGrid.row - doorGridRow);
            if (manhattanDistance <= 1) { // 문 또는 주변 셀 클릭
                console.log('Clicked near door, moving to door entrance');
                
                // 문 자체를 클릭한 것이 아니라 주변 영역을 클릭한 경우는 이동만 수행 (전환은 하지 않음)
                this.isTransitioningToHome = false; // 전환 플래그를 false로 설정
                
                // 문 아래 셀로 이동
                console.log('Moving to door entrance...');
                this.moveToGridCell(doorGridCol, doorTargetRow, (pathFound) => {
                    if (!pathFound) {
                        console.log('No path to door entrance found');
                    }
                });
                return;
            }

            if (this.isPlantingMode) {
                const cellKey = `${targetGrid.col},${targetGrid.row}`;
                if (this.occupiedCells.has(cellKey)) {
                    console.log(`Cannot plant at [${targetGrid.col}, ${targetGrid.row}], cell occupied.`);
                    return;
                }

                // 플레이어의 현재 위치 확인
                const playerGrid = this.worldToGrid(this.player.x, this.player.y);
                console.log(`Player position: [${playerGrid.col}, ${playerGrid.row}], Target: [${targetGrid.col}, ${targetGrid.row}]`);
                
                // 플레이어가 클릭한 셀과의 거리 계산
                // 1. 클릭한 셀에 플레이어가 있는 경우 - 맨해튼 거리 = 0
                // 2. 클릭한 셀이 인접한 경우 - 맨해튼 거리 = 1 
                // 3. 그 외의 경우 - 맨해튼 거리 > 1
                const manhattanDistance = Math.abs(playerGrid.col - targetGrid.col) + Math.abs(playerGrid.row - targetGrid.row);
                console.log(`Manhattan distance to planting location: ${manhattanDistance}`);
                
                // 플레이어가 심을 셀에 있거나 인접해 있으면 바로 심기
                if (manhattanDistance <= 1) {
                    // 이미 셀에 있거나 인접해 있으므로 바로 심기
                    console.log(`Player at or adjacent to [${targetGrid.col}, ${targetGrid.row}], planting directly...`);
                    
                    // 심기 로직 실행
                    const plantWorldPos = this.gridToWorld(targetGrid.col, targetGrid.row);
                    
                    const seedSprite = this.add.sprite(plantWorldPos.x, plantWorldPos.y, 'seed');
                    const plantData = {
                        type: 'seed', 
                        stage: 0,
                        plantedTime: this.time.now,
                        lastWatered: 0, 
                        gridCol: targetGrid.col, 
                        gridRow: targetGrid.row,
                        lastGrowthTime: 0,
                        lastGrowthDay: this.gameTime.day, // 초기 식물 심은 날짜 추가
                        lastGrowthHour: this.gameTime.hours, // 성장 시간 추가
                        lastGrowthMinutes: this.gameTime.minutes // 성장 분 추가
                    };
                    seedSprite.setData('plantData', plantData);
                    seedSprite.setInteractive({ useHandCursor: true });
                    this.seeds.add(seedSprite);
                    this.setupSeedClickListener(seedSprite);

                    // 상태 및 Registry 업데이트
                    this.occupiedCells.add(cellKey);
                    
                    try {
                        this.easystar.avoidAdditionalPoint(targetGrid.col, targetGrid.row);
                        console.log(`EasyStar obstacle set at [${targetGrid.col}, ${targetGrid.row}]`);
                    } catch (e) {
                        console.error("Error setting EasyStar obstacle:", e);
                    }
                    
                    const currentState = this.registry.get('gardenState');
                    currentState.plants.push(plantData);
                    currentState.occupiedCells[cellKey] = true;
                    this.registry.set('gardenState', currentState);

                    console.log(`Cell [${targetGrid.col}, ${targetGrid.row}] marked occupied. Registry updated.`);
                    
                    // 심기 모드 비활성화
                    this.isMovingToPlant = false;
                    this.isPlantingMode = false;
                    console.log("Seed planted, planting mode disabled. Press P to plant another seed.");
                    return;
                }

                // --- 인접하지 않은 경우 기존 로직대로 인접 셀로 이동 ---
                console.log(`심을 위치 [${targetGrid.col}, ${targetGrid.row}] 선택. 인접 셀 탐색...`);
                const adjacentCell = this.findWalkableAdjacentCell(targetGrid.col, targetGrid.row);

                if (adjacentCell) {
                    console.log(`인접 이동 가능 셀 [${adjacentCell.col}, ${adjacentCell.row}] 발견. 경로 탐색...`);
                    this.isMovingToPlant = true;
                    this.plantingTargetGrid = targetGrid; // 심을 위치는 원래 목표 셀
                    this.isMovingToWater = false;
                    this.isMovingToCat = false;
                    this.isTransitioningToHome = false;
                    this.moveToGridCell(adjacentCell.col, adjacentCell.row, (pathFound) => {
                        if (!pathFound) {
                            console.log('No path to adjacent cell found');
                            this.isMovingToPlant = false;
                        }
                    });
                } else {
                     console.log(`심을 위치 [${targetGrid.col}, ${targetGrid.row}] 주변에 접근 가능한 셀이 없습니다.`);
                     // TODO: 화면 메시지
                }
                // ---------------------------------

            } else {
                // 식물이 있는 셀인지 확인
                const seedToWater = this.seeds.getChildren().find(seed => {
                    const seedData = seed.getData('plantData');
                    return seedData && seedData.gridCol === targetGrid.col && seedData.gridRow === targetGrid.row;
                });
                
                if (seedToWater) {
                    // 식물이 있는 셀 클릭 - 플레이어 위치 확인
                    const playerGrid = this.worldToGrid(this.player.x, this.player.y);
                    const seedData = seedToWater.getData('plantData');
                    const seedCol = seedData.gridCol;
                    const seedRow = seedData.gridRow;
                    
                    // 플레이어와 식물의 거리 계산
                    const manhattanDistance = Math.abs(playerGrid.col - seedCol) + Math.abs(playerGrid.row - seedRow);
                    
                    if (manhattanDistance <= 1) {
                        // 플레이어가 식물에 인접한 경우 바로 물주기
                        seedToWater.emit('pointerdown', { stopPropagation: () => {} });
                    } else {
                        // 멀리 있는 경우 식물 근처로 이동 후 물주기
                        console.log(`Moving to water plant at [${seedCol}, ${seedRow}]`);
                        const adjacentCell = this.findWalkableAdjacentCell(seedCol, seedRow);
                        if (adjacentCell) {
                            this.targetSeed = seedToWater;
                            this.isMovingToWater = true;
                            this.isMovingToPlant = false;
                            this.isMovingToCat = false;
                            this.isTransitioningToHome = false;
                            this.moveToGridCell(adjacentCell.col, adjacentCell.row, (pathFound) => {
                                if (!pathFound) {
                                    console.log('No path to seed found');
                                    this.isMovingToWater = false;
                                    this.targetSeed = null;
                                }
                            });
                        } else {
                            console.log(`Cannot reach plant at [${seedCol}, ${seedRow}]`);
                        }
                    }
                    return;
                }
                
                // 일반 이동 (빈 셀로)
                console.log(`Calculating path to grid [${targetGrid.col}, ${targetGrid.row}]...`);
                this.isTransitioningToHome = false;
                this.isMovingToPlant = false;
                this.isMovingToWater = false;
                this.isMovingToCat = false;
                this.moveToGridCell(targetGrid.col, targetGrid.row, (pathFound) => {
                    if (!pathFound) {
                        console.log(`No path to [${targetGrid.col}, ${targetGrid.row}] found`);
                    }
                });
            }
        });

        // --- 키보드 입력 리스너 추가 --- 
        this.input.keyboard.on('keydown-P', () => {
            console.log('P key pressed'); // 로그 추가
            this.togglePlantingMode(); 
        });
        this.input.keyboard.on('keydown-ESC', () => {
            console.log('ESC key pressed'); // 로그 추가
            this.disableAllModes();
        });
        // -----------------------------

        // --- 고양이 등장 타이머 시작 --- 
        this.catSpawnTimer = this.time.addEvent({
            delay: 15000, // 15초마다 등장 시도 (테스트용)
            callback: this.trySpawnCat, // 호출할 함수
            callbackScope: this, // 함수의 this 컨텍스트
            loop: true // 반복
        });
        console.log('Cat spawn timer started');
        // -----------------------------

        this.cameras.main.fadeIn(500, 0, 0, 0);
        this.isTransitioningToHome = false; // Scene 시작 시 플래그 초기화
        this.isMovingToPlant = false; // Scene 시작 시 초기화
        this.arrivalData = null; // 사용 후 초기화 (선택적)

        // --- 바위 추가 (랜덤 위치에 2~3개) ---
        this.stones = this.add.group();
        // 바위 개수 랜덤 결정 (2~3개)
        const stoneCount = Phaser.Math.Between(2, 3);
        console.log(`Adding ${stoneCount} stones to the garden`);
        
        // 바위 배치 시 피해야 할 영역
        const avoidAreas = [
            // 플레이어 시작 위치 주변
            { col: initialGridCol, row: initialGridRow, radius: 2 },
            // 문 주변
            { col: doorGridCol, row: doorGridRow, radius: 2 },
            { col: doorGridCol, row: doorGridRow + 1, radius: 2 }
        ];
        
        // 등록된 식물 위치도 피해야 함
        const existingPlants = this.registry.get('gardenState');
        if (existingPlants && existingPlants.plants) {
            existingPlants.plants.forEach(plant => {
                avoidAreas.push({ col: plant.gridCol, row: plant.gridRow, radius: 1 });
            });
        }
        
        // 바위 개수만큼 반복
        for (let i = 0; i < stoneCount; i++) {
            // 유효한 위치 찾기 (최대 10번 시도)
            let validPosition = false;
            let attempts = 0;
            let stoneGridCol, stoneGridRow;
            
            while (!validPosition && attempts < 10) {
                // 랜덤 위치 생성 (상단 영역 피하기)
                stoneGridCol = Phaser.Math.Between(3, this.gridWidth - 4); // 가장자리에서 3칸 이상 떨어진 위치
                stoneGridRow = Phaser.Math.Between(3, this.gridHeight - 4); // 상단과 하단에서 3칸 이상 떨어진 위치
                
                // 선택한 위치가 피해야 할 영역에 있는지 확인
                validPosition = true;
                for (const area of avoidAreas) {
                    const distance = Phaser.Math.Distance.Between(stoneGridCol, stoneGridRow, area.col, area.row);
                    if (distance < area.radius) {
                        validPosition = false;
                        break;
                    }
                }
                
                // 이미 점유된 셀인지 확인
                const cellKey = `${stoneGridCol},${stoneGridRow}`;
                if (this.occupiedCells.has(cellKey)) {
                    validPosition = false;
                }
                
                attempts++;
            }
            
            // 유효한 위치를 찾았다면 바위 추가
            if (validPosition) {
                const stoneWorldPos = this.gridToWorld(stoneGridCol, stoneGridRow);
                const stone = this.add.sprite(stoneWorldPos.x, stoneWorldPos.y, 'stone');
                this.stones.add(stone);
                
                // 해당 위치를 점유 상태로 표시
                const cellKey = `${stoneGridCol},${stoneGridRow}`;
                this.occupiedCells.add(cellKey);
                
                // EasyStar에도 장애물로 등록
                this.easystar.avoidAdditionalPoint(stoneGridCol, stoneGridRow);
                
                // Registry에도 저장 (식물과 구분하기 위해 타입 추가)
                if (existingPlants) {
                    existingPlants.occupiedCells[cellKey] = true;
                    // 바위 정보 저장 (필요하다면)
                    if (!existingPlants.stones) existingPlants.stones = [];
                    existingPlants.stones.push({ gridCol: stoneGridCol, gridRow: stoneGridRow });
                    this.registry.set('gardenState', existingPlants);
                }
                
                console.log(`Stone placed at grid [${stoneGridCol}, ${stoneGridRow}]`);
            }
        }
        console.log('Stones added to garden');
        // ---------------------------

        console.log('Garden Scene Created and Player Initialized for Grid');
    }

    // --- 말풍선 생성 헬퍼 ---
    createSpeechBubble(x, y, text, duration = 2000) {
        const bubblePadding = 10;
        const arrowHeight = 10;

        // 텍스트 객체 먼저 생성해서 크기 계산
        const textObject = this.add.text(0, 0, text, {
            fontSize: '14px',
            color: '#000000',
            backgroundColor: '#ffffff', // 임시 배경색으로 크기 측정 용이
            padding: { x: bubblePadding, y: bubblePadding },
            wordWrap: { width: 150 } // 자동 줄바꿈 너비
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
        textObject.setPosition(0, -(arrowHeight + bubblePadding)); // 버블 내부 위치로

        // 컨테이너로 묶기
        const bubbleContainer = this.add.container(x, y, [bubble, textObject]);
        bubbleContainer.setDepth(10); // 다른 객체들보다 위에 보이도록

        // 일정 시간 후 제거
        this.time.delayedCall(duration, () => {
            bubbleContainer.destroy();
        });

        return bubbleContainer; // 필요시 참조 반환
    }
    // ------------------------

    // --- 모드 변경 헬퍼 함수들 --- 
    updatePlayerColor() {
        if (!this.player || !this.player.active) return;
        this.player.clearTint(); // 이전 틴트 제거
        if (this.isPlantingMode) {
            this.player.setTint(0x00FF00); // 초록색 틴트
        } else if (this.isWateringMode) {
            this.player.setTint(0x00FFFF); // 하늘색 틴트
        }
        // 기본 상태는 틴트 없음 (원래 색상)
    }

    togglePlantingMode() {
        this.isPlantingMode = !this.isPlantingMode;
        if (this.isPlantingMode) {
            console.log('Planting mode ENABLED (Press P again or ESC to disable)');
        } else {
            console.log('Planting mode DISABLED');
            this.isMovingToPlant = false; // 심기 모드 비활성화 시 이동 플래그도 초기화
            this.plantingTargetGrid = null; // 타겟 그리드도 초기화
        }
        // this.updatePlayerColor(); // 색상 변경 호출 제거
    }

    disableAllModes() {
        this.isPlantingMode = false;
        this.isMovingToPlant = false;
        this.isMovingToWater = false;
        this.isMovingToCat = false; // 추가
        this.targetSeed = null;
        console.log('All modes DISABLED');
        if (this.player && this.player.active) {
            this.updatePlayerColor();
        }
    }
    // ---------------------------

    // --- 인접 빈 셀 찾기 헬퍼 ---
    findWalkableAdjacentCell(targetCol, targetRow) {
        // 부모 클래스의 함수 호출
        return super.findWalkableAdjacentCell(targetCol, targetRow);
    }

    // --- 씨앗 클릭 리스너 설정 함수 ---
    setupSeedClickListener(seed) {
        seed.off('pointerdown');
        seed.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            const seedData = seed.getData('plantData');
            if (!seedData) return;
            const seedCol = seedData.gridCol;
            const seedRow = seedData.gridRow;
            console.log(`Seed at [${seedCol}, ${seedRow}] clicked. Checking if player is adjacent...`);

            // 플레이어의 현재 위치 확인
            const playerGrid = this.worldToGrid(this.player.x, this.player.y);
            
            // 플레이어와 씨앗과의 거리 계산 (맨해튼 거리)
            // 0: 플레이어가 씨앗이 있는 셀에 있음
            // 1: 인접한 셀에 있음
            // >1: 멀리 있음
            const manhattanDistance = Math.abs(playerGrid.col - seedCol) + Math.abs(playerGrid.row - seedRow);
            
            // 플레이어가 씨앗 위에 있거나 인접해 있으면 바로 물주기
            if (manhattanDistance <= 1) {
                // 이미 씨앗에 있거나 인접해 있으므로 바로 물주기
                console.log(`Player at or adjacent to plant at [${seedCol}, ${seedRow}], watering directly...`);
                
                // 물주기 전 현재 성장 시간 정보 기록 (디버깅용)
                console.log(`물주기 전: [${seedData.gridCol}, ${seedData.gridRow}] 성장시간 - 일: ${seedData.lastGrowthDay || 'undefined'}, 시간: ${seedData.lastGrowthHour || 'undefined'}, 분: ${seedData.lastGrowthMinutes || 'undefined'}`);
                
                // 물주기 로직 실행
                seedData.lastWatered = this.time.now;
                console.log(`물주기 완료: [${seedData.gridCol}, ${seedData.gridRow}] 식물의 물 상태 업데이트됨`);
                
                // --- Registry 업데이트 --- 
                const currentState = this.registry.get('gardenState');
                const plantInRegistry = currentState.plants.find(p => p.gridCol === seedData.gridCol && p.gridRow === seedData.gridRow);
                if (plantInRegistry) {
                    plantInRegistry.lastWatered = seedData.lastWatered;
                    // 성장 시간 정보는 업데이트하지 않음 (물을 줄 때마다 성장 타이머가 리셋되지 않도록)
                    this.registry.set('gardenState', currentState);
                    console.log(`Registry 업데이트 완료: 물주기 상태만 변경됨`);
                }
                
                // 시각적 효과
                seed.setTint(0xADD8E6);
                this.time.delayedCall(500, () => {
                    if (seed && seed.active) {
                        seed.clearTint();
                    }
                });
                return;
            }

            // 인접하지 않은 경우 인접 셀로 이동 후 물주기
            console.log(`Finding adjacent cell to plant at [${seedCol}, ${seedRow}]...`);
            const adjacentCell = this.findWalkableAdjacentCell(seedCol, seedRow);

            if (adjacentCell) {
                console.log(`Found adjacent walkable cell at [${adjacentCell.col}, ${adjacentCell.row}]. Calculating path...`);
                this.targetSeed = seed;
                this.isMovingToWater = true;
                this.isMovingToPlant = false;
                this.isMovingToCat = false;
                this.isTransitioningToHome = false;
                this.moveToGridCell(adjacentCell.col, adjacentCell.row, (pathFound) => {
                    if (!pathFound) {
                        console.log('No path to seed found');
                        this.isMovingToWater = false;
                        this.targetSeed = null;
                    }
                });
            } else {
                console.log(`Cannot reach seed at [${seedCol}, ${seedRow}] to water. No adjacent walkable cell.`);
            }
        });
    }

    // --- 그리드 그리기 함수 (유지) --- 
    drawGrid() {
        const graphics = this.add.graphics({ lineStyle: { width: 1, color: 0xcccccc, alpha: 0.5 } });
        // 세로선
        for (let i = 0; i <= this.gridWidth; i++) {
            graphics.lineBetween(i * this.tileSize, 0, i * this.tileSize, this.gridHeight * this.tileSize);
        }
        // 가로선
        for (let j = 0; j <= this.gridHeight; j++) {
            graphics.lineBetween(0, j * this.tileSize, this.gridWidth * this.tileSize, j * this.tileSize);
        }
        console.log('Grid drawn for debugging');
    }

    // --- 고양이 관련 함수들 --- 
    trySpawnCat() {
        // 고양이나 씬이 활성화되지 않았으면 실행하지 않음
        if (!this.cat || !this.player || this.cat.visible || !this.scene.isActive()) {
            console.log('Cat spawn check: Already visible, scene inactive, or required objects not available.');
            return;
        }
        console.log('Attempting cat spawn...');

        if (Math.random() < this.catSpawnProbability) {
            // 모든 변수 명확히 정의
            let spawnGridCol = 0;
            let spawnGridRow = 0;
            let cellKey = '';
            let isPlayerAtSpawnPos = false;
            let attempts = 0;
            const maxAttempts = this.gridWidth * this.gridHeight; // 최대 시도 횟수

            // 플레이어의 현재 위치 확인
            const playerGrid = this.worldToGrid(this.player.x, this.player.y);
            const playerCellKey = `${playerGrid.col},${playerGrid.row}`;
            
            // 빈 셀 찾기 (최대 시도)
            do {
                spawnGridCol = Phaser.Math.Between(0, this.gridWidth - 1);
                spawnGridRow = Phaser.Math.Between(0, this.gridHeight - 1);
                cellKey = `${spawnGridCol},${spawnGridRow}`;
                
                // 플레이어가 있는 그리드에는 고양이가 나타나지 않도록 함
                isPlayerAtSpawnPos = (playerGrid.col === spawnGridCol && playerGrid.row === spawnGridRow);
                
                attempts++;
            } while ((this.occupiedCells.has(cellKey) || isPlayerAtSpawnPos) && attempts < maxAttempts);

            // 가능한 셀을 찾았고 플레이어가 없는 곳인지 확인
            if (!this.occupiedCells.has(cellKey) && !isPlayerAtSpawnPos) {
                // 빈 셀 찾음
                const catWorldPos = this.gridToWorld(spawnGridCol, spawnGridRow);
                this.cat.setPosition(catWorldPos.x, catWorldPos.y);
                this.cat.setData({ gridCol: spawnGridCol, gridRow: spawnGridRow }); // 그리드 위치 저장
                this.cat.setVisible(true);
                console.log(`고양이가 나타났습니다! at grid [${spawnGridCol}, ${spawnGridRow}]`);

                const stayDuration = 10000;
                if (this.catStayTimer) {
                    this.catStayTimer.remove(false);
                }
                this.catStayTimer = this.time.delayedCall(stayDuration, this.hideCat, [], this);
            } else {
                console.log('Cat spawn failed: No empty cell found or player occupying the cell.');
            }
        } else {
            console.log('Cat did not appear this time.');
        }
    }

    hideCat() {
        if (this.cat && this.cat.visible) {
            this.cat.setVisible(false);
            this.cat.setPosition(-100,-100); // 화면 밖으로 다시 이동
            console.log('고양이가 사라졌습니다.');
        }
        // 머무는 시간 타이머 정리
        if (this.catStayTimer) {
            this.catStayTimer.remove(false);
            this.catStayTimer = null;
        }
    }
    // ---------------------------

    // --- 좌표 변환 함수 --- 
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
    // -----------------------

    // --- 홈 씬으로 전환하는 함수 ---
    startHomeTransition() {
        console.log('Starting transition to Home...');
        this.disableAllModes(); 
        this.cameras.main.fadeOut(500, 0, 0, 0, (camera, progress) => {
            if (progress === 1) {
                // HomeScene 전환 시, 도착해야 할 문의 그리드 정보 전달
                const homeExitDoorGridCol = Math.floor(this.gridWidth / 2); // HomeScene 문의 Col (가정)
                const homeExitDoorGridRow = this.gridHeight - 2; // HomeScene 문의 Row (가정, 아래에서 2번째)
                
                // HomeScene 인스턴스 생성 전 참조
                const homeScene = this.scene.get('HomeScene');
                // 시간 정보 전달 (씬이 생성되었다면)
                if (homeScene) {
                    this.passTimeToNextScene(homeScene);
                }
                
                this.scene.start('HomeScene', { 
                    arrivingAt: 'exitDoor', 
                    targetGridCol: homeExitDoorGridCol, 
                    targetGridRow: homeExitDoorGridRow 
                });
            }
        });
    }
    // ---------------------------------

    update(time, delta) {
        // --- BaseScene의 경로 이동 업데이트 함수 사용 ---
        const pathEndReached = this.updatePathMovement(delta);
        
        // 경로 끝에 도달한 경우에만 도착 처리 로직 실행
        if (pathEndReached) {
            // --- 기존 도착 처리 로직 --- 
            if (this.isMovingToPlant && this.plantingTargetGrid) {
                const targetGrid = this.plantingTargetGrid;
                const plantWorldPos = this.gridToWorld(targetGrid.col, targetGrid.row);
                console.log(`Reached planting grid [${targetGrid.col}, ${targetGrid.row}], planting seed...`);

                const seedSprite = this.add.sprite(plantWorldPos.x, plantWorldPos.y, 'seed');
                const plantData = {
                    type: 'seed', 
                    stage: 0,
                    plantedTime: this.time.now,
                    lastWatered: 0, 
                    gridCol: targetGrid.col, 
                    gridRow: targetGrid.row,
                    lastGrowthTime: 0,
                    lastGrowthDay: this.gameTime.day, // 초기 식물 심은 날짜 추가
                    lastGrowthHour: this.gameTime.hours, // 성장 시간 추가
                    lastGrowthMinutes: this.gameTime.minutes // 성장 분 추가
                };
                seedSprite.setData('plantData', plantData);
                seedSprite.setInteractive({ useHandCursor: true });
                this.seeds.add(seedSprite);
                this.setupSeedClickListener(seedSprite);

                // --- 상태 및 Registry 업데이트 ---
                const cellKey = `${targetGrid.col},${targetGrid.row}`;
                this.occupiedCells.add(cellKey); // 로컬 Set 업데이트
                
                // EasyStar 장애물 설정 - 오류 수정됨
                try {
                    // getGrid 대신 직접 avoidAdditionalPoint만 사용
                    this.easystar.avoidAdditionalPoint(targetGrid.col, targetGrid.row);
                    console.log(`EasyStar obstacle set at [${targetGrid.col}, ${targetGrid.row}]`);
                } catch (e) {
                    console.error("Error setting EasyStar obstacle:", e);
                }
                
                const currentState = this.registry.get('gardenState');
                currentState.plants.push(plantData);
                currentState.occupiedCells[cellKey] = true;
                this.registry.set('gardenState', currentState);

                console.log(`Cell [${targetGrid.col}, ${targetGrid.row}] marked occupied. Registry updated.`);
                // --------------------------------

                this.plantingTargetGrid = null;
                // 심기 모드 비활성화
                this.isMovingToPlant = false;
                this.isPlantingMode = false;
                console.log("Seed planted, planting mode disabled. Press P to plant another seed.");
            } else if (this.isMovingToWater && this.targetSeed) {
                console.log('Reached seed grid, watering...');
                const plantData = this.targetSeed.getData('plantData');
                if (plantData) {
                    // 물주기 전 현재 성장 시간 정보 기록 (디버깅용)
                    console.log(`물주기 전: [${plantData.gridCol}, ${plantData.gridRow}] 성장시간 - 일: ${plantData.lastGrowthDay || 'undefined'}, 시간: ${plantData.lastGrowthHour || 'undefined'}, 분: ${plantData.lastGrowthMinutes || 'undefined'}`);
                    
                    // 물주기 로직 실행
                    plantData.lastWatered = this.time.now;
                    console.log(`물주기 완료: [${plantData.gridCol}, ${plantData.gridRow}] 식물의 물 상태 업데이트됨`);

                    // --- Registry 업데이트 --- 
                    const currentState = this.registry.get('gardenState');
                    const plantInRegistry = currentState.plants.find(p => p.gridCol === plantData.gridCol && p.gridRow === plantData.gridRow);
                    if (plantInRegistry) {
                        plantInRegistry.lastWatered = plantData.lastWatered;
                        // 성장 시간 정보는 업데이트하지 않음 (물을 줄 때마다 성장 타이머가 리셋되지 않도록)
                        this.registry.set('gardenState', currentState);
                        console.log(`Registry 업데이트 완료: 물주기 상태만 변경됨`);
                    }
                    // -----------------------

                    this.targetSeed.setTint(0xADD8E6);
                    this.time.delayedCall(500, () => {
                        if (this.targetSeed && this.targetSeed.active) {
                             this.targetSeed.clearTint();
                        }
                    });
                }
                this.disableAllModes(); // 모든 모드 비활성화
            } else if (this.isMovingToCat) {
                console.log('고양이 옆 셀에 도착!');
                
                // 말풍선 생성 및 표시
                if (this.cat && this.cat.visible) {
                    this.createSpeechBubble(this.cat.x, this.cat.y - this.cat.height / 2 - 5, "야옹! 선물을 받아라냥!");
                    
                    // 잠시 후 고양이 숨기고 상태 초기화
                    this.time.delayedCall(2100, () => { // 말풍선 지속시간보다 약간 길게
                        this.hideCat(); 
                        console.log('선물 획득! (임시)'); 
                        // TODO: 실제 선물 획득 로직
                    });
                } else {
                    // 혹시 고양이가 먼저 사라진 경우
                     this.disableAllModes();
                }
            } else if (this.isTransitioningToHome) {
                console.log('Player reached the door cell, starting transition to Home...');
                this.startHomeTransition();
            } else {
                console.log('Reached general grid cell via path.');
            }
        }
        // --- 씨앗 성장 로직 (Registry 업데이트 추가) ---
        const currentTime = this.time.now;
        this.seeds.getChildren().forEach(seed => {
            const plantData = seed.getData('plantData');
            if (!plantData) return;
            
            // 물을 준 이후 성장 로직
            const timeSinceWatered = currentTime - plantData.lastWatered;
            
            // 물을 준 표시 효과
            if (plantData.lastWatered > 0 && timeSinceWatered < 60000) {
                // 물이 충분히 있는 상태 시각화 (옅은 파란색 틴트)
                seed.setTint(0xC0E0FF);
            } else {
                // 물이 필요한 상태로 표시 (틴트 제거)
                seed.clearTint();
            }
            
            // 현재 게임 날짜와 마지막 성장 날짜를 비교하여 성장 여부 결정
            // 식물이 최종 단계가 아니고, 물이 있는 상태이며
            // 마지막 성장 이후 게임 내에서 일정 시간 지난 경우에만 성장
            if (plantData.lastWatered > 0 && 
                timeSinceWatered < 60000 && 
                plantData.stage < 4) {
                
                // 성장 조건 확인
                let shouldGrow = false;
                
                // 마지막 성장 시간이 설정되어 있는지 확인
                if (plantData.lastGrowthHour === undefined || plantData.lastGrowthMinutes === undefined) {
                    // 시간 정보가 없으면 현재 시간으로 초기화
                    plantData.lastGrowthDay = this.gameTime.day;
                    plantData.lastGrowthHour = this.gameTime.hours;
                    plantData.lastGrowthMinutes = this.gameTime.minutes;
                    console.log(`Initialized growth time for plant at [${plantData.gridCol}, ${plantData.gridRow}]`);
                } else {
                    // 두 가지 조건 검사:
                    // 1. 마지막 성장 이후 충분한 시간이 지났는지 (성장 단계 간 시간)
                    // 2. 물을 준 이후 충분한 시간이 지났는지 (물 효과 시간)
                    
                    // 1. 마지막 성장으로부터 시간 경과 계산 (총 분 단위로 환산)
                    const currentTotalMinutes = this.gameTime.day * 24 * 60 + this.gameTime.hours * 60 + this.gameTime.minutes;
                    const lastGrowthTotalMinutes = plantData.lastGrowthDay * 24 * 60 + plantData.lastGrowthHour * 60 + plantData.lastGrowthMinutes;
                    const growthMinutesElapsed = currentTotalMinutes - lastGrowthTotalMinutes;
                    
                    // 2. 물을 준 시간으로부터 경과 계산
                    // 게임 시간으로 변환 (실제 시간 -> 게임 내 시간)
                    const waterTimeInMinutes = (this.time.now - plantData.lastWatered) / 1000 * this.timeScale;
                    
                    console.log(`성장 검사: [${plantData.gridCol}, ${plantData.gridRow}] - 마지막 성장 후 경과: ${growthMinutesElapsed}분 (필요: 10분), 물 준 후 경과: ${waterTimeInMinutes.toFixed(2)}분 (필요: 3분)`);
                    
                    // 두 조건 모두 충족: 성장 단계 간 10분 이상 & 물 준 후 3분 이상
                    if (growthMinutesElapsed >= 10 && waterTimeInMinutes >= 3) {
                        shouldGrow = true;
                        console.log(`성장 조건 충족: 성장 간격 ${growthMinutesElapsed}분, 물 효과 ${waterTimeInMinutes.toFixed(2)}분`);
                    }
                }
                
                // 성장 조건 충족시 성장 처리
                if (shouldGrow) {
                    // 성장 단계에 따른 처리
                    switch (plantData.stage) {
                        case 0: // 씨앗 -> 새싹
                            console.log('Seed growing to sprout!');
                            seed.setTexture('sprout');
                            plantData.stage = 1;
                            break;
                            
                        case 1: // 새싹 -> 작은 식물
                            console.log('Sprout growing to small plant!');
                            seed.setTexture('plant'); // small_plant 대신 plant 사용
                            plantData.stage = 2;
                            break;
                            
                        case 2: // 작은 식물 -> 큰 식물
                            console.log('Small plant growing to big plant!');
                            seed.setTexture('big_plant');
                            plantData.stage = 3;
                            break;
                            
                        case 3: // 큰 식물 -> 꽃이 핀 식물
                            console.log('Big plant flowering! Changing texture to flower_plant');
                            seed.clearTint(); // 혹시 tint가 적용되어 있을 경우 제거
                            seed.setTexture('flower_plant');
                            seed.setScale(1); // 원래 크기로 설정 (혹시 크기 문제가 있을 경우)
                            plantData.stage = 4;
                            console.log('Stage changed to 4, displaying flower_plant texture');
                            break;
                    }
                    
                    // 성장 후 상태 업데이트
                    const now = this.time.now;
                    
                    // 성장 시간 정보 업데이트
                    plantData.lastGrowthDay = this.gameTime.day;
                    plantData.lastGrowthHour = this.gameTime.hours;
                    plantData.lastGrowthMinutes = this.gameTime.minutes;
                    plantData.lastWatered = 0; // 새 단계로 갔으니 물 주기 초기화
                    
                    // Registry 업데이트 (식물 성장 상태 저장)
                    const currentState = this.registry.get('gardenState');
                    const plantInRegistry = currentState.plants.find(p => 
                        p.gridCol === plantData.gridCol && p.gridRow === plantData.gridRow
                    );
                    
                    if (plantInRegistry) {
                        plantInRegistry.stage = plantData.stage;
                        plantInRegistry.lastGrowthDay = plantData.lastGrowthDay;
                        plantInRegistry.lastGrowthHour = plantData.lastGrowthHour;
                        plantInRegistry.lastGrowthMinutes = plantData.lastGrowthMinutes;
                        plantInRegistry.lastWatered = 0; // 성장 후에는 물 주기 초기화
                        this.registry.set('gardenState', currentState);
                        console.log(`성장 완료: [${plantData.gridCol}, ${plantData.gridRow}]의 식물이 단계 ${plantData.stage}로 성장`);
                    }
                }
            } else if (plantData.lastGrowthDay === undefined) {
                // 기존 식물은 초기화가 필요함 (이전 시스템에서 마이그레이션)
                plantData.lastGrowthDay = this.gameTime.day;
                plantData.lastGrowthHour = this.gameTime.hours;
                plantData.lastGrowthMinutes = this.gameTime.minutes;
                console.log(`Initialized growth time for plant at [${plantData.gridCol}, ${plantData.gridRow}]`);
            }
        });
        // -----------------------------------------
    }
} 