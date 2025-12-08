import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { createTerrainGeometry } from './terrain.js';

// Configuration
const CONFIG = {
    renderScale: 0.5, // Lower resolution for performance on mobile
    tiles: { x: 2, y: 2 },
    bounces: 3, // Enough for simple transparency/reflection
    waterLevel: -2.0
};

// State
let camera, scene, renderer, pathTracer;
let controls;
let isInteracting = false;
let loadingDiv = document.getElementById('loading');
let samples = 0;

async function init() {
    const container = document.getElementById('canvas-container');

    // 1. Setup Three.js Basics
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap pixel ratio
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(60, 25, 60);
    camera.lookAt(0, 0, 0);

    scene = new THREE.Scene();

    // 2. Load Assets
    const textureLoader = new THREE.TextureLoader();
    const envMapPromise = new Promise(resolve => textureLoader.load('sky_alpine_golden_hour.png', resolve));
    const rockTexPromise = new Promise(resolve => textureLoader.load('alpine_rock_snow.png', resolve));
    const waterNormPromise = new Promise(resolve => textureLoader.load('water_ripples.png', resolve));

    const [envMap, rockTex, waterNorm] = await Promise.all([envMapPromise, rockTexPromise, waterNormPromise]);

    // Setup Environment
    envMap.mapping = THREE.EquirectangularReflectionMapping;
    envMap.colorSpace = THREE.SRGBColorSpace;
    scene.environment = envMap;
    scene.background = envMap;

    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
    rockTex.repeat.set(8, 8);
    rockTex.colorSpace = THREE.SRGBColorSpace;

    waterNorm.wrapS = waterNorm.wrapT = THREE.RepeatWrapping;
    waterNorm.repeat.set(4, 4);

    // 3. Create Scene Objects

    // Terrain
    const terrainGeo = createTerrainGeometry(200, 200, 128); // 128 segments
    const terrainMat = new THREE.MeshStandardMaterial({
        map: rockTex,
        roughness: 0.8,
        metalness: 0.1,
        color: 0xffffff
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);

    // Water
    const waterGeo = new THREE.PlaneGeometry(200, 200);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.translate(0, CONFIG.waterLevel, 0);

    const waterMat = new THREE.MeshPhysicalMaterial({
        color: 0x88ccff,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.95, // Glass-like
        thickness: 2.0, // Volume
        ior: 1.33,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        normalMap: waterNorm,
        normalScale: new THREE.Vector2(0.5, 0.5)
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    scene.add(waterMesh);

    // 4. Setup Path Tracer
    pathTracer = new WebGLPathTracer(renderer);
    pathTracer.setScene(scene, camera);

    // Path Tracer Settings
    pathTracer.renderScale = CONFIG.renderScale;
    pathTracer.tiles.set(CONFIG.tiles.x, CONFIG.tiles.y);
    pathTracer.filterGlossyFactor = 0.5; // Reduce noise on glossy surfaces

    // We need to await the geometry build
    await pathTracer.updateGenerator();

    // 5. Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 120;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    controls.target.set(0, 5, 0);

    controls.addEventListener('change', () => {
        pathTracer.reset(); // Reset accumulation when moving
        isInteracting = true;
    });

    controls.addEventListener('start', () => { isInteracting = true; });
    controls.addEventListener('end', () => { isInteracting = false; });

    // 6. Audio
    setupAudio();

    // 7. Hide loading
    loadingDiv.style.opacity = '0';
    setTimeout(() => loadingDiv.remove(), 500);

    // 8. Start Loop
    animate();

    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function setupAudio() {
    const listener = new THREE.AudioListener();
    camera.add(listener);
    const sound = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('alpine_lake_ambience.mp3', function(buffer) {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setVolume(0.5);
        sound.play();
    });

    // Resume audio context on interaction
    const resumeAudio = () => {
        if (listener.context.state === 'suspended') {
            listener.context.resume();
        }
        window.removeEventListener('click', resumeAudio);
        window.removeEventListener('touchstart', resumeAudio);
    };
    window.addEventListener('click', resumeAudio);
    window.addEventListener('touchstart', resumeAudio);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    pathTracer.updateCamera();
    pathTracer.reset();
}

function animate() {
    requestAnimationFrame(animate);

    controls.update();

    // If interacting or just started, we render at low quality (basically raster preview or low sample)
    // The path tracer automatically accumulates samples if we don't reset.
    // When controls move, we call reset() which clears samples.

    // Update path tracer
    // If the scene is static, it accumulates samples and converges to a photorealistic image.
    pathTracer.renderSample();

    samples++;
}

init();