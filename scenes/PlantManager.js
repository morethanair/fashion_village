// import Phaser from 'phaser'; // Removed as Phaser is loaded globally
// import Plant from './Plant.js'; // 아직 Plant 클래스가 없으므로 주석 처리

export default class PlantManager {
    constructor(scene, registry, occupiedCells, easystar) {
        this.scene = scene;
        this.registry = registry;
        this.occupiedCells = occupiedCells; // Reference to the Set in GardenScene
        this.easystar = easystar; // Reference to the EasyStar instance
        this.plants = this.scene.add.group(); // 식물 그룹
        this.player = null; // 플레이어 참조

        // Mode flags (will likely be expanded)
        // this.isPlantingMode = false; // Removed for long-press planting
        this.plantingTargetGrid = null;
        this.isMovingToPlant = false; // 이동 목적: 심기
        this.isMovingToWater = false; // 이동 목적: 물주기
        this.interactionTargetPlant = null; // 상호작용 대상 식물 (물주기, 비료주기 등)

        // Inventory/State (might move to a separate inventory manager later)
        this.fertilizerCount = this.registry.get('fertilizerCount') || 0;
        this.hasWateringCan = true; // TEMP: 테스트를 위해 기본적으로 물뿌리개 소유

        console.log("PlantManager initialized");
        console.log("TEMP: Watering can set to true by default for testing."); // 임시 로그 추가
    }

    // --- 초기 설정 ---
    setPlayer(player) {
        this.player = player;
        console.log("Player reference set in PlantManager");
    }

    loadPlants() {
        // GardenScene의 create에서 식물 로드/재생성 로직 이동
        const gardenState = this.registry.get('gardenState') || { plants: [], occupiedCells: {} }; // 기본값 설정
        const savedPlants = gardenState.plants || [];
        console.log(`PlantManager: Loading ${savedPlants.length} plants from registry...`);
        savedPlants.forEach(plantData => {
            this._recreatePlantFromData(plantData);
        });
        console.log("PlantManager: Plant loading complete.");
    }

    // --- 식물 상태 관리 ---
    savePlants() {
        const plantsData = this.plants.getChildren().map(plant => plant.getData('plantData'));
        const gardenState = this.registry.get('gardenState') || { plants: [], occupiedCells: {} }; // 기존 상태 가져오기
        gardenState.plants = plantsData; // 식물 데이터 업데이트
        // occupiedCells는 GardenScene에서 관리되므로 여기서는 직접 수정하지 않음
        this.registry.set('gardenState', gardenState);
        console.log("PlantManager: Plants saved to registry.");
    }

    // --- 심기 모드 관리 (제거) ---
    // togglePlantingMode() {
    //     // GardenScene의 togglePlantingMode 로직 이동
    //     this.isPlantingMode = !this.isPlantingMode;
    //     if (this.isPlantingMode) {
    //         console.log('Planting mode ENABLED by PlantManager');
    //         this.scene.showTemporaryMessage("심을 위치를 선택하세요.", 1500);
    //         // 다른 모드 비활성화 (예: 물주기 모드)
    //         this.isMovingToWater = false;
    //         this.interactionTargetPlant = null;
    //     } else {
    //         console.log('Planting mode DISABLED by PlantManager');
    //     }
    //     // TODO: UI 업데이트 로직 필요 시 추가
    // }

    disablePlantingMovement() {
        this.isMovingToPlant = false;
        this.plantingTargetGrid = null;
        console.log("Planting movement disabled via PlantManager");
    }

    // --- 식물 상호작용 (클릭 처리) ---
    handlePointerDown(pointer) {
        const targetGrid = this.scene.worldToGrid(pointer.worldX, pointer.worldY);
        console.log(`PlantManager: Pointer down at grid [${targetGrid.col}, ${targetGrid.row}]`);

        // 식물이 있는지 확인
        const existingPlant = this.getPlantAt(targetGrid.col, targetGrid.row);

        // if (this.isPlantingMode) {
        //     // 심기 모드 처리
        //     return this._handlePlantingClick(targetGrid);
        // }

        // 이 로직은 이제 사용되지 않음 (숏클릭은 GardenScene에서 처리)
        // if (existingPlant) {
        //     // 기존 식물 클릭 처리 (물주기, 비료주기 등)
        //     return this._handleExistingPlantClick(existingPlant);
        // }

        return false; // PlantManager는 더 이상 직접 클릭 이벤트를 처리하지 않음 (식물 자체 리스너 제외)
    }

    // --- 심기 요청 처리 ---
    requestPlanting(targetGrid) {
        console.log(`PlantManager: Planting requested at [${targetGrid.col}, ${targetGrid.row}]`);
        const cellKey = `${targetGrid.col},${targetGrid.row}`;

        // 이미 점유된 셀인지 다시 확인 (혹시 모르니)
        if (this.occupiedCells.has(cellKey)) {
            console.warn(`PlantManager: Cell [${targetGrid.col}, ${targetGrid.row}] is already occupied. Planting cancelled.`);
            // Scene에 메시지 표시는 GardenScene의 handleLongClick에서 처리
            return false; // 심기 불가
        }

        // 이동 가능한 인접 셀 찾기
        const adjacentCell = this.scene.findWalkableAdjacentCell(targetGrid.col, targetGrid.row);

        if (adjacentCell) {
            console.log(`PlantManager: Found adjacent cell [${adjacentCell.col}, ${adjacentCell.row}] for planting. Moving...`);
            // 심을 위치(원래 타겟)와 이동 상태 설정
            this.plantingTargetGrid = { col: targetGrid.col, row: targetGrid.row };
            this.isMovingToPlant = true;
            this.isMovingToWater = false; // 다른 이동 플래그 초기화
            this.interactionTargetPlant = null;

            // 인접 셀로 이동 요청
            this._moveToInteract(adjacentCell.col, adjacentCell.row, "plant");
            return true; // 심기 진행
        } else {
            console.warn(`PlantManager: Cannot find walkable adjacent cell to plant at [${targetGrid.col}, ${targetGrid.row}]`);
            this.scene.showTemporaryMessage("씨앗을 심을 위치에 접근할 수 없어요.", 1500);
            return false; // 심기 불가
        }
    }

    // --- 실제 식물 생성 / 물주기 / 비료주기 액션 ---
    plantSeedAt(gridCol, gridRow) {
        // GardenScene의 plantSeed 로직 이동
        console.log(`PlantManager: Planting seed at [${gridCol}, ${gridRow}]...`);
        const plantWorldPos = this.scene.gridToWorld(gridCol, gridRow);

        // Plant 클래스가 없으므로 임시로 스프라이트 생성
        const plantSprite = this.scene.add.sprite(plantWorldPos.x, plantWorldPos.y, 'seed');

        const plantData = {
            type: 'seed',
            stage: 0,
            plantedTime: this.scene.time.now, // Phaser의 시간 사용
            lastWatered: 0,
            gridCol: gridCol,
            gridRow: gridRow,
            lastGrowthTime: 0, // 사용하지 않을 수 있음
            lastGrowthDay: this.scene.gameTime.day, // 현재 게임 시간 사용
            lastGrowthHour: this.scene.gameTime.hours,
            lastGrowthMinutes: this.scene.gameTime.minutes
        };
        plantSprite.setData('plantData', plantData);
        plantSprite.setInteractive({ useHandCursor: true });
        this.plants.add(plantSprite);
        this._setupPlantClickListener(plantSprite);

        // 상태 업데이트
        const cellKey = `${gridCol},${gridRow}`;
        this.occupiedCells.add(cellKey);
        try {
            this.easystar.avoidAdditionalPoint(gridCol, gridRow);
        } catch (e) {
            console.error(`PlantManager: Error setting EasyStar obstacle at [${gridCol}, ${gridRow}]:`, e);
        }

        // Registry 업데이트 (GardenScene의 gardenState를 직접 수정)
        const gardenState = this.registry.get('gardenState');
        gardenState.plants.push(plantData);
        gardenState.occupiedCells[cellKey] = true; // 점유 상태 추가
        this.registry.set('gardenState', gardenState);

        console.log(`PlantManager: Seed planted at [${gridCol}, ${gridRow}]. Occupied cells and registry updated.`);

        // 심기 후 상태 초기화
        this.isMovingToPlant = false;
        this.plantingTargetGrid = null;
        console.log("PlantManager: Planting mode disabled after planting.");
    }

    // --- 이동 완료 처리 ---
    handlePathMovementEnd(targetGrid) { // targetGrid는 도착한 인접 셀
        console.log(`PlantManager: Handling path movement end at grid [${targetGrid.col}, ${targetGrid.row}]`);

        if (this.isMovingToPlant && this.plantingTargetGrid) { // 심기 이동 중이었고, 심을 목표 위치가 있다면
            // 인접 셀에 도착했으므로, 원래 목표했던 plantingTargetGrid에 씨앗 심기
            console.log(`PlantManager: Reached adjacent cell [${targetGrid.col}, ${targetGrid.row}] to plant at [${this.plantingTargetGrid.col}, ${this.plantingTargetGrid.row}]`);
            this.plantSeedAt(this.plantingTargetGrid.col, this.plantingTargetGrid.row);
            // plantSeedAt 내부에서 관련 상태 초기화됨 (isMovingToPlant = false 등)
            return true; // 심기 경로 처리 완료
        } else if (this.isMovingToWater && this.interactionTargetPlant) { // 물주기 이동 중이었고 목표 식물이 있다면
            // 인접 셀에 도착한 것으로 간주
            const plantData = this.interactionTargetPlant.getData('plantData');
            if (plantData) { // 목표 식물의 데이터가 유효한지 확인
                 console.log(`PlantManager: Reached adjacent cell [${targetGrid.col}, ${targetGrid.row}] to water plant at [${plantData.gridCol}, ${plantData.gridRow}]`);
                 this._handleWateringAction(this.interactionTargetPlant); // 즉시 물주기 실행
            } else {
                 // 이 경우는 거의 없겠지만, 혹시 이동 중에 식물 데이터가 사라진 경우
                 console.warn("PlantManager: Reached water target, but interactionTargetPlant lost its data.");
            }
            // 상태 초기화
            this.isMovingToWater = false;
            this.interactionTargetPlant = null;
            return true; // 물주기 경로 처리 완료
        } else {
            // 다른 이동 완료 (예: 비료주기)
            console.log("PlantManager: Path movement ended, no specific plant action.");
            return false; // PlantManager가 처리한 액션 없음
        }
        // 이동 관련 플래그 초기화는 GardenScene의 disableAllMovementFlags 에서도 처리될 수 있음
    }

    // --- 유틸리티 함수 ---
    getPlantAt(gridCol, gridRow) {
        return this.plants.getChildren().find(plant => {
            const plantData = plant.getData('plantData');
            return plantData && plantData.gridCol === gridCol && plantData.gridRow === gridRow;
        });
    }

    // --- 업데이트 로직 (식물 성장 등) ---
    update(time, delta) {
        // GardenScene의 update 루프에서 식물 성장 로직 이동
        // console.log("PlantManager update check..."); // Too noisy
        this._updatePlantGrowth(time);
    }

    // --- Private Helper Methods ---

    _recreatePlantFromData(plantData) {
        if (!plantData || plantData.gridCol === undefined || plantData.gridRow === undefined) {
            console.warn("PlantManager: Invalid plant data found during load:", plantData);
            return;
        }

        const texture = this._getTextureForStage(plantData.stage);
        const plantWorldPos = this.scene.gridToWorld(plantData.gridCol, plantData.gridRow);

        // Plant 클래스 없으므로 스프라이트로 생성
        const plantSprite = this.scene.add.sprite(plantWorldPos.x, plantWorldPos.y, texture);

        // 꽃 핀 식물 특별 처리 (GardenScene에서 가져옴)
        if (plantData.stage === 4) {
            plantSprite.clearTint();
            plantSprite.setScale(1);
            console.log('PlantManager: Applied special handling for flower_plant texture');
        }

        plantSprite.setData('plantData', plantData);
        plantSprite.setInteractive({ useHandCursor: true });
        this.plants.add(plantSprite);
        this._setupPlantClickListener(plantSprite);

        // 점유 상태 및 경로 장애물 설정
        const cellKey = `${plantData.gridCol},${plantData.gridRow}`;
        this.occupiedCells.add(cellKey);
        try {
            this.easystar.avoidAdditionalPoint(plantData.gridCol, plantData.gridRow);
        } catch (e) {
             console.error(`PlantManager: Error setting EasyStar obstacle during recreate at [${plantData.gridCol},${plantData.gridRow}]:`, e);
        }

        console.log(`PlantManager: Recreated plant at [${plantData.gridCol}, ${plantData.gridRow}], stage: ${plantData.stage}`);
    }

    _getTextureForStage(stage) {
        switch (stage) {
            case 0: return 'seed';
            case 1: return 'sprout';
            case 2: return 'plant'; // small_plant 대신 plant 사용
            case 3: return 'big_plant';
            case 4: return 'flower_plant';
            default: return 'seed'; // 기본값
        }
    }

    _setupPlantClickListener(plantSprite) {
        plantSprite.off('pointerdown'); // 기존 리스너 제거
        plantSprite.on('pointerdown', (pointer, localX, localY, event) => { // event 인자 추가
            event.stopPropagation(); // event 객체의 stopPropagation 호출
            const plantData = plantSprite.getData('plantData');
            if (!plantData) {
                console.error('PlantManager: Plant data not found on clicked sprite.');
                return;
            }
            console.log(`PlantManager: Plant clicked at [${plantData.gridCol}, ${plantData.gridRow}]`, plantData);
            // 실제 상호작용 로직은 _handleExistingPlantClick 에서 처리 (이전 핸들러는 handlePointerDown 호출했었음, 직접 _handleExistingPlantClick 호출로 변경)
            this._handleExistingPlantClick(plantSprite);
        });
    }

    _handleExistingPlantClick(plantSprite) {
        const plantData = plantSprite.getData('plantData');
        if (!plantData) return false;

        console.log(`PlantManager: Handling click on existing plant at [${plantData.gridCol}, ${plantData.gridRow}]`);

        // 물주기 가능 여부 확인 (물뿌리개 소지, 쿨다운 등)
        if (this.hasWateringCan && plantData.stage < 4) { // 꽃 핀 식물은 물 안 줘도 됨
            const now = this.scene.time.now;
            const waterCooldown = 5000; // 5초 (임시)
            if (!plantData.lastWatered || now - plantData.lastWatered > waterCooldown) {
                // 플레이어 위치 확인
                if (!this.player) {
                    console.error("PlantManager: Player reference is missing.");
                    return false;
                }
                const playerGrid = this.scene.worldToGrid(this.player.x, this.player.y);
                const plantGrid = { col: plantData.gridCol, row: plantData.gridRow };

                // 거리 계산
                const distance = Math.abs(playerGrid.col - plantGrid.col) + Math.abs(playerGrid.row - plantGrid.row);

                if (distance <= 1) {
                    // 인접한 경우: 즉시 물주기
                    console.log(`PlantManager: Player is adjacent to plant at [${plantGrid.col}, ${plantGrid.row}]. Watering directly.`);
                    this._handleWateringAction(plantSprite);
                    // 이동 플래그는 설정하지 않음
                    this.isMovingToWater = false;
                    this.interactionTargetPlant = null;
                } else {
                    // 멀리 있는 경우: 인접 셀로 이동
                    console.log(`PlantManager: Player is not adjacent. Finding path to water plant at [${plantGrid.col}, ${plantGrid.row}]`);

                    // 이동 가능한 인접 셀 찾기 (BaseScene의 함수 사용)
                    const adjacentCell = this.scene.findWalkableAdjacentCell(plantGrid.col, plantGrid.row);

                    if (adjacentCell) {
                        console.log(`PlantManager: Found adjacent cell [${adjacentCell.col}, ${adjacentCell.row}]. Moving...`);
                        this.interactionTargetPlant = plantSprite; // 상호작용 대상 설정
                        this.isMovingToWater = true;            // 물주기 위한 이동 플래그 설정
                        this.isMovingToPlant = false;
                        this.plantingTargetGrid = null;

                        this._moveToInteract(adjacentCell.col, adjacentCell.row, "water"); // 인접 셀로 이동 요청
                    } else {
                        console.warn(`PlantManager: Cannot find walkable adjacent cell to water plant at [${plantGrid.col}, ${plantGrid.row}]`);
                        this.scene.showTemporaryMessage("식물에 접근할 수 없어요.", 1500);
                    }
                }
                return true; // 물주기 시도 처리됨
            }
            else {
                console.log("PlantManager: Plant doesn't need watering yet.");
                 this.scene.showTemporaryMessage("아직 물을 줄 필요가 없어요.", 1500);
                 return true; // 클릭 처리됨
            }
        } else if (!this.hasWateringCan) {
             console.log("PlantManager: Watering can needed.");
             this.scene.showTemporaryMessage("물뿌리개가 필요합니다.", 1500);
             return true;
        } else if (plantData.stage === 4) {
             console.log("PlantManager: Flowered plant doesn't need watering.");
             this.scene.showTemporaryMessage("이미 다 자랐어요!", 1500);
             return true;
        }

        // TODO: 비료주기 로직 추가

        return false; // 처리할 상호작용 없음
    }

    _handleWateringAction(plantSprite) {
        const plantData = plantSprite.getData('plantData');
        if (!plantData) return;

        console.log(`PlantManager: Executing watering action for plant at [${plantData.gridCol}, ${plantData.gridRow}]`);
        plantData.lastWatered = this.scene.time.now;

        // Registry 업데이트
        const gardenState = this.registry.get('gardenState');
        const plantInRegistry = gardenState.plants.find(p => p.gridCol === plantData.gridCol && p.gridRow === plantData.gridRow);
        if (plantInRegistry) {
            plantInRegistry.lastWatered = plantData.lastWatered;
            this.registry.set('gardenState', gardenState);
            console.log(`PlantManager: Registry updated for watering at [${plantData.gridCol}, ${plantData.gridRow}]`);
        }

        // 시각 효과
        plantSprite.setTint(0xADD8E6); // 파란색 틴트
        this.scene.time.delayedCall(500, () => {
            if (plantSprite && plantSprite.active) {
                plantSprite.clearTint();
            }
        });
    }

    _moveToInteract(targetCol, targetRow, interactionType) {
        console.log(`PlantManager: Requesting move to [${targetCol}, ${targetRow}] for ${interactionType}`);
        // GardenScene의 이동 함수 호출 필요
        // this.scene.moveToGridCell(targetCol, targetRow, ...) 방식으로 호출해야 함
        if (typeof this.scene.moveToGridCell === 'function') {
            this.scene.moveToGridCell(targetCol, targetRow, (pathFound) => {
                if (pathFound) {
                    console.log(`PlantManager: Path found to [${targetCol}, ${targetRow}] for ${interactionType}. Movement started.`);
                } else {
                    console.log(`PlantManager: No path found to [${targetCol}, ${targetRow}] for ${interactionType}.`);
                    // 경로 못 찾았을 때 상태 초기화
                    if (interactionType === 'plant') {
                        this.isMovingToPlant = false;
                        this.plantingTargetGrid = null;
                    } else if (interactionType === 'water') {
                        this.isMovingToWater = false;
                        this.interactionTargetPlant = null;
                    }
                }
            });
        } else {
            console.error("PlantManager: Cannot call moveToGridCell on the scene. Function not found!");
        }
    }

    _updatePlantGrowth(currentTime) {
        const growthCheckInterval = 1000; // 매 초마다 체크 (너무 빈번할 수 있음)
        if (!this._lastGrowthCheck || currentTime - this._lastGrowthCheck > growthCheckInterval) {
            this._lastGrowthCheck = currentTime;

            this.plants.getChildren().forEach(plantSprite => {
                // Plant 클래스 인스턴스일 때만 처리 (나중에 Plant 클래스 도입 후)
                // if (!(plantSprite instanceof Plant)) return;

                const plantData = plantSprite.getData('plantData');
                if (!plantData || plantData.stage >= 4) return; // 데이터 없거나 이미 다 자랐으면 통과

                // 물 준 상태이고, 충분한 시간이 지났는지 확인
                const timeSinceWatered = currentTime - plantData.lastWatered;
                const hasWater = plantData.lastWatered > 0 && timeSinceWatered < 60000; // 60초간 물 효과 지속

                // 시각적 표시 (물이 있거나 없을 때)
                if (hasWater) {
                    plantSprite.setTint(0xC0E0FF); // 연한 파란색
                } else {
                    plantSprite.clearTint();
                }

                if (!hasWater) return; // 물 없으면 성장 안 함

                // 마지막 성장 시간 기준 확인 (게임 시간 기준)
                let shouldGrow = false;
                const currentTotalMinutes = this.scene.gameTime.day * 24 * 60 + this.scene.gameTime.hours * 60 + this.scene.gameTime.minutes;
                const lastGrowthTotalMinutes = (plantData.lastGrowthDay || 0) * 24 * 60 + (plantData.lastGrowthHour || 0) * 60 + (plantData.lastGrowthMinutes || 0);
                const growthMinutesElapsed = currentTotalMinutes - lastGrowthTotalMinutes; // 마지막 성장 후 게임 시간 경과 (분)

                // 물 준 시점으로부터 게임 시간 경과 (분) 계산
                const realTimeElapsedMs = timeSinceWatered;
                const realTimeElapsedSeconds = realTimeElapsedMs / 1000;
                const waterGameMinutesElapsed = realTimeElapsedSeconds * this.scene.gameTime.timeScale;

                // 성장 조건: 마지막 성장 후 게임 시간 10분 이상 & 물 준 후 게임 시간 5분 이상
                if (growthMinutesElapsed >= 10 && waterGameMinutesElapsed >= 5) {
                     shouldGrow = true;
                     console.log(`PlantManager: Growth condition met for [${plantData.gridCol}, ${plantData.gridRow}] (Game Time Elapsed Since Growth: ${growthMinutesElapsed}m, Since Water: ${waterGameMinutesElapsed.toFixed(1)}m)`);
                 }

                if (shouldGrow) {
                    plantData.stage++;
                    const newTexture = this._getTextureForStage(plantData.stage);
                    plantSprite.setTexture(newTexture);
                    console.log(`PlantManager: Plant at [${plantData.gridCol}, ${plantData.gridRow}] grew to stage ${plantData.stage} (${newTexture})`);

                    // 성장 후 상태 업데이트
                    plantData.lastGrowthDay = this.scene.gameTime.day;
                    plantData.lastGrowthHour = this.scene.gameTime.hours;
                    plantData.lastGrowthMinutes = this.scene.gameTime.minutes;
                    plantData.lastWatered = 0; // 성장하면 물 효과 초기화
                    plantSprite.clearTint(); // 성장 시 틴트 제거

                    // Registry 업데이트
                    const gardenState = this.registry.get('gardenState');
                    const plantInRegistry = gardenState.plants.find(p => p.gridCol === plantData.gridCol && p.gridRow === plantData.gridRow);
                    if (plantInRegistry) {
                        plantInRegistry.stage = plantData.stage;
                        plantInRegistry.lastGrowthDay = plantData.lastGrowthDay;
                        plantInRegistry.lastGrowthHour = plantData.lastGrowthHour;
                        plantInRegistry.lastGrowthMinutes = plantData.lastGrowthMinutes;
                        plantInRegistry.lastWatered = plantData.lastWatered;
                        this.registry.set('gardenState', gardenState);
                        console.log(`PlantManager: Registry updated for growth at [${plantData.gridCol}, ${plantData.gridRow}]`);
                    }
                }
            });
        }
    }
} 