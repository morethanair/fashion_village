// import Phaser from 'phaser'; // Removed as Phaser is loaded globally

export default class CatManager {
    constructor(scene, registry, occupiedCells, easystar) {
        this.scene = scene;
        this.registry = registry;
        this.occupiedCells = occupiedCells; // Reference to the Set in GardenScene
        this.easystar = easystar; // Reference to the EasyStar instance

        this.cat = null;
        this.catSpawnTimer = null;
        this.catStayTimer = null;
        this.catSpawnProbability = 0.8; // 스폰 확률 조정 (10%)
        this.catStayDuration = 10000; // 고양이 머무는 시간 (10초)
        this.isMovingToCat = false; // Track movement towards the cat

        console.log("CatManager initialized");
    }

    // --- 고양이 생성 및 설정 ---
    createCat() {
        console.log("CatManager: Creating cat sprite...");
        const initialGridPos = { col: -1, row: -1 }; // 초기 위치 (화면 밖)
        const initialWorldPos = this.scene.gridToWorld(initialGridPos.col, initialGridPos.row);

        this.cat = this.scene.add.sprite(initialWorldPos.x, initialWorldPos.y, 'cat');
        this.cat.setInteractive({ useHandCursor: true });
        this.cat.setVisible(false);
        this.cat.setData('gridCol', -1);
        this.cat.setData('gridRow', -1);

        // 클릭 리스너는 handlePointerDown에서 직접 처리
        console.log("CatManager: Cat sprite created and hidden.");
    }

    // --- 고양이 스폰 로직 ---
    startSpawning() {
        if (!this.cat) {
            console.error("CatManager: Cannot start spawning, cat sprite not created yet.");
            return;
        }
        if (this.catSpawnTimer) this.catSpawnTimer.remove(); // Prevent duplicates
        this.catSpawnTimer = this.scene.time.addEvent({
            delay: 15000, // 15초마다 시도
            callback: this.trySpawnCat,
            callbackScope: this,
            loop: true
        });
        console.log('CatManager: Cat spawn timer started.');
    }

    stopSpawning() {
        if (this.catSpawnTimer) {
             this.catSpawnTimer.remove();
             this.catSpawnTimer = null;
             console.log("CatManager: Cat spawn timer stopped.");
        }
        this.hideCat(); // 스포닝 중지 시 고양이 숨김
    }

    trySpawnCat() {
        if (this.cat.visible || !this.scene.scene.isActive(this.scene.scene.key)) {
            // console.log('CatManager: Spawn check - Already visible or scene inactive.');
            return;
        }
        console.log('CatManager: Attempting cat spawn...');

        if (Math.random() < this.catSpawnProbability) {
            let spawnGridCol, spawnGridRow, cellKey;
            let attempts = 0;
            const maxAttempts = this.scene.gridWidth * this.scene.gridHeight; // 최대 시도 횟수

            // 플레이어 위치 가져오기 (scene.player가 있어야 함)
            const player = this.scene.player;
            let playerGrid = { col: -1, row: -1 };
            if (player) {
                 playerGrid = this.scene.worldToGrid(player.x, player.y);
            } else {
                console.warn("CatManager: Player reference not found in scene.");
                // 플레이어 없으면 스폰 시도 중단 또는 다른 처리
                return;
            }

            // 빈 셀 찾기
            do {
                spawnGridCol = Phaser.Math.Between(0, this.scene.gridWidth - 1);
                spawnGridRow = Phaser.Math.Between(0, this.scene.gridHeight - 1);
                cellKey = `${spawnGridCol},${spawnGridRow}`;

                // 플레이어 위치와 겹치는지, occupiedCells에 있는지 확인
                const isPlayerGrid = (playerGrid.col === spawnGridCol && playerGrid.row === spawnGridRow);
                const isOccupied = this.occupiedCells.has(cellKey);

                // 문 근처(상단 2줄)는 피하도록 추가
                const isNearDoor = spawnGridRow <= 1;

                attempts++;
                if (!isPlayerGrid && !isOccupied && !isNearDoor) {
                    break; // 적절한 위치 찾음
                } else if (attempts >= maxAttempts) {
                    console.log('CatManager: Could not find a suitable empty cell for cat spawn after max attempts.');
                    return; // 최대 시도 초과
                }

            } while (true);

            // 고양이 위치 설정 및 표시
            const spawnWorldPos = this.scene.gridToWorld(spawnGridCol, spawnGridRow);
            this.cat.setPosition(spawnWorldPos.x, spawnWorldPos.y);
            this.cat.setData('gridCol', spawnGridCol);
            this.cat.setData('gridRow', spawnGridRow);
            this.cat.setVisible(true);
            console.log(`CatManager: Cat spawned at [${spawnGridCol}, ${spawnGridRow}]`);

            // 일정 시간 후 숨김 타이머 설정
            if (this.catStayTimer) this.catStayTimer.remove();
            this.catStayTimer = this.scene.time.delayedCall(this.catStayDuration, this.hideCat, [], this);
            console.log(`CatManager: Cat stay timer set for ${this.catStayDuration / 1000} seconds.`);

        } else {
            // console.log('CatManager: Spawn attempt failed (probability check).');
        }
    }

    hideCat() {
        if (this.cat && this.cat.visible) {
            this.cat.setVisible(false);
            this.cat.setData('gridCol', -1); // Reset grid position
            this.cat.setData('gridRow', -1);
            console.log("CatManager: Cat hidden.");
        }
        if (this.catStayTimer) {
            this.catStayTimer.remove();
            this.catStayTimer = null;
            // console.log("CatManager: Cat stay timer removed.");
        }
    }

     // --- 상호작용 처리 ---
    handlePointerDown(pointer, event) {
         if (this.cat && this.cat.visible && this.cat.getBounds().contains(pointer.worldX, pointer.worldY)) {
            console.log("CatManager: Cat clicked!");
            if (event) event.stopPropagation();

            const catGridCol = this.cat.getData('gridCol');
            const catGridRow = this.cat.getData('gridRow');

            if (catGridCol === -1 || catGridRow === -1) {
                console.warn("CatManager: Cat clicked but grid data is invalid.");
                return false;
            }

            // 이동 가능한 인접 셀 찾기
            const adjacentCell = this.scene.findWalkableAdjacentCell(catGridCol, catGridRow);

            if (!adjacentCell) {
                console.warn(`CatManager: Cannot find walkable adjacent cell near cat at [${catGridCol}, ${catGridRow}]`);
                this.scene.showTemporaryMessage("고양이에게 다가갈 수 없어요!", 1500);
                return true; // 클릭은 처리됨
            }

            console.log(`CatManager: Found adjacent cell [${adjacentCell.col}, ${adjacentCell.row}] near cat. Moving...`);

            // GardenScene의 모든 이동 비활성화 요청
            if (typeof this.scene.disableAllMovementFlags === 'function') {
                 this.scene.disableAllMovementFlags();
            }

            this.isMovingToCat = true; // 고양이에게 이동 시작

            console.log(`CatManager: Requesting move to adjacent cell [${adjacentCell.col}, ${adjacentCell.row}]`);
            // GardenScene의 이동 함수 호출 (인접 셀로)
            if (typeof this.scene.moveToGridCell === 'function') {
                this.scene.moveToGridCell(adjacentCell.col, adjacentCell.row, (pathFound) => {
                    if (pathFound) {
                        console.log(`CatManager: Path found to adjacent cell [${adjacentCell.col}, ${adjacentCell.row}]. Movement started.`);
                    } else {
                        console.log(`CatManager: No path found to adjacent cell [${adjacentCell.col}, ${adjacentCell.row}].`);
                        this.isMovingToCat = false; // 경로 없으면 상태 초기화
                    }
                });
            } else {
                 console.error("CatManager: Cannot call moveToGridCell on the scene.");
                 this.isMovingToCat = false;
            }

            return true; // 고양이 클릭 이벤트 처리 완료
         }
         return false; // 고양이 클릭 아님
    }

    // --- 이동 완료 처리 ---
    handlePathMovementEnd(targetGrid) { // targetGrid는 도착한 인접 셀
         if (this.isMovingToCat && this.cat && this.cat.visible) {
             // 인접 셀에 도착했으므로, 위치 비교 없이 바로 상호작용 실행
             console.log(`CatManager: Reached adjacent cell [${targetGrid.col}, ${targetGrid.row}] near the cat.`);

             // 상호작용 (말풍선 등)
             // BaseScene에 추가된 함수 호출
             if (typeof this.scene.createSpeechBubble === 'function') {
                 this.scene.createSpeechBubble(this.cat.x, this.cat.y - this.cat.height / 2 - 5, "야옹! 선물을 받아라냥!");
             } else {
                 console.error("CatManager: createSpeechBubble function not found in the scene!");
             }

             // 잠시 후 고양이 숨기기 및 상태 초기화
             this.scene.time.delayedCall(2100, () => {
                 this.hideCat();
                 console.log('CatManager: Gift received! (Placeholder)');
                 // TODO: 실제 선물 획득 로직 (예: this.registry 업데이트)
             });

             this.isMovingToCat = false; // 상호작용 시작 시 이동 상태 해제
             return true; // 고양이 도착 처리 완료
         }
         return false; // 고양이 관련 도착 처리 아님
    }

    disableCatMovement() {
        if (this.isMovingToCat) {
             console.log("Cat movement disabled via CatManager");
        }
        this.isMovingToCat = false;
    }

    // --- 업데이트 로직 (주로 타이머 관리) ---
    update(time, delta) {
        // Potentially check timers or other periodic cat logic if needed
        // console.log("CatManager update check..."); // Too noisy
    }
} 