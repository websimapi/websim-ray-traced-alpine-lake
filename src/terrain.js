import * as THREE from 'three'; 
import { createNoise2D } from 'simplex-noise';

export function createTerrainGeometry(width, depth, segments) {
    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    const noise2D = createNoise2D(); 
    
    const posAttribute = geometry.attributes.position;
    
    // Fractal Brownian Motion settings
    const octaves = 6;
    const persistence = 0.5;
    const lacunarity = 2.0;
    const scale = 0.008; // Adjust for frequency of mountains
    const heightScale = 45; // Max height

    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i); // This is actually Z in world space initially (plane is XY)
        
        let amplitude = 1;
        let frequency = 1;
        let noiseValue = 0;
        
        // FBM Loop
        for (let o = 0; o < octaves; o++) {
            noiseValue += noise2D(x * scale * frequency, y * scale * frequency) * amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        // Shape the terrain
        // Create a valley/lake bed in the center roughly
        const distFromCenter = Math.sqrt(x*x + y*y);
        const valleyMask = Math.max(0, (distFromCenter - 20) / 100); 
        
        // Apply height
        let z = noiseValue * heightScale;
        
        // Flatten the bottom for the lake slightly to avoid weird artifacts underwater, 
        // but keep it rough enough for interest
        if (z < -5) {
            z = -5 + (z + 5) * 0.3; 
        }

        posAttribute.setZ(i, z);
    }

    geometry.computeVertexNormals(); 
    
    // Rotate to lie flat on XZ plane
    geometry.rotateX(-Math.PI / 2);
    
    return geometry;
}