import {
  BufferGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Font,
  FontLoader,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  ShapeBufferGeometry,
  Vector3,
} from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';

const fontLoader = new FontLoader();

const fontMap: Record<string, Font> = {};

async function preloadFont(fontName: string): Promise<Font> {
  if (!(fontName in fontMap)) {
    let font: Font;
    if (fontName == 'zh') {
      font = await fontLoader.loadAsync('fonts/Source-Han-Sans-SC-Regular.subset.json');
    } else if (fontName == 'en') {
      font = await fontLoader.loadAsync('fonts/Roboto-Regular.json');
    } else if (fontName == 'condensed') {
      font = await fontLoader.loadAsync('fonts/Roboto-Condensed-Regular.json');
    } else if (fontName == 'math') {
      font = await fontLoader.loadAsync('fonts/Computer-Modern-Regular.json');
    } else if (fontName == 'code') {
      font = await fontLoader.loadAsync('fonts/Consolas-Regular.json');
    } else if (fontName == 'gdh') {
      font = await fontLoader.loadAsync('fonts/zcool-gdh-Regular.subset.json');
    } else if (fontName == 'arcade') {
      font = await fontLoader.loadAsync('fonts/Public-Pixel-Regular.json');
    } else {
      font =await fontLoader.loadAsync(fontName)
    }

    fontMap[fontName] = font;
  }
  return fontMap[fontName];
}

interface TextMeshObjectParams {
  fontSize?: number;
  letterSpacing?: number;
  color?: Color;
  font?: string;
  centerTextVertically?: boolean;
  material?: Material;
  text3D?: boolean;
  stroke?: boolean;
  strokeWidth?: number;
}

export default class TextMeshObject extends Group {
  centerTextVertically: boolean;
  color: Color;
  font: string;
  fonts: Font[];
  fontSize: number;
  letterSpacing: number;
  material: Material;
  shouldUpdate = true;
  stroke: boolean;
  strokeWidth: number;
  text: string;
  text3D: boolean;

  constructor({
    centerTextVertically = false,
    color = new Color(0xffffff),
    font = 'en,zh',
    fontSize = 1.0,
    letterSpacing = 0,
    stroke = false,
    strokeWidth = 0.02,
    text3D = false,
    material,
  }: TextMeshObjectParams = {}) {
    super();

    this.centerTextVertically = centerTextVertically;
    this.color = color;
    this.font = font;
    this.fontSize = fontSize;
    this.letterSpacing = letterSpacing;
    this.stroke = stroke;
    this.strokeWidth = strokeWidth;
    this.text3D = text3D;

    if (material) {
      this.material = material.clone();
    } else {
      this.material = new MeshBasicMaterial({
        color,
        side: DoubleSide,
      });
    }
  }

  async init() {
    this.fonts = await Promise.all(this.font.split(',').map((fontName) => preloadFont(fontName)));
  }

  setText(text: string, forceUpdate = false) {
    this.text = text;
    this.shouldUpdate = true;
    if (forceUpdate) {
      this.updateText();
    }
  }

  updateText() {
    if (this.shouldUpdate) {
      // TODO: optimize: text update is slow.
      this.children.length = 0;

      let totalWidth = 0;
      const letterPosX: number[] = [];
      let minY = Number.MAX_VALUE;
      let maxY = Number.MIN_VALUE;
      const geometries: ShapeBufferGeometry[] = [];
      for (const [i, char] of [...this.text].entries()) {
        if (char === ' ') {
          totalWidth += this.fontSize * 0.5;
        } else {
          let font: Font;
          let glyph: any;
          for (let j = 0; j < this.fonts.length; j++) {
            font = this.fonts[j];
            glyph = (font.data as any).glyphs[char];
            if (glyph) {
              break;
            } else if (j == this.fonts.length - 1) {
              glyph = (font.data as any).glyphs['?'];
            }
          }

          const fontData = font.data as any;
          const resolution = fontData.resolution;
          const ha = (glyph.ha / resolution) * this.fontSize;

          const shapes = font.generateShapes(char, this.fontSize);

          let geometry;
          if (this.text3D) {
            const extrudeSettings = {
              depth: this.fontSize * 0.2,
              bevelEnabled: false,
            };
            geometry = new ExtrudeGeometry(shapes, extrudeSettings);
          } else if (this.stroke) {
            const style = SVGLoader.getStrokeStyle(
              this.strokeWidth,
              this.color.getStyle() // color in CSS context style
            );
            // Add shape.holes to shapes
            const holeShapes = [];
            for (let i = 0; i < shapes.length; i++) {
              const shape = shapes[i];
              if (shape.holes && shape.holes.length > 0) {
                for (let j = 0; j < shape.holes.length; j++) {
                  const hole = shape.holes[j];
                  holeShapes.push(hole);
                }
              }
            }
            shapes.push.apply(shapes, holeShapes);

            const geoms: BufferGeometry[] = [];
            for (const shape of shapes) {
              const points = shape.getPoints();
              const geom = SVGLoader.pointsToStroke(
                points.map((v) => new Vector3(v.x, v.y)),
                style
              );
              geoms.push(geom);
            }
            geometry = geoms.length > 1 ? mergeBufferGeometries(geoms) : geoms[0];
          } else {
            geometry = new ShapeBufferGeometry(shapes);
          }

          geometry.computeBoundingBox();

          geometries.push(geometry);

          // Always create a separate material for each letter
          const mesh = new Mesh(geometry, this.material.clone());
          mesh.name = char;

          const letterWidth = ha;
          const xMid = 0.5 * letterWidth;
          geometry.translate(
            -0.5 * (geometry.boundingBox.min.x + geometry.boundingBox.max.x),
            -0.5 * this.fontSize,
            0
          );

          letterPosX.push(totalWidth + xMid);
          totalWidth +=
            letterWidth + (i < this.text.length - 1 ? this.letterSpacing * this.fontSize : 0);
          minY = Math.min(minY, geometry.boundingBox.min.y);
          maxY = Math.max(maxY, geometry.boundingBox.max.y);

          this.add(mesh);
        }
      }

      // Center text geometry vertically
      const deltaY = (maxY + minY) * 0.5;
      if (this.centerTextVertically) {
        for (const geometry of geometries) {
          geometry.translate(0, -deltaY, 0);
        }
      }

      this.children.forEach((letter, i) => {
        letter.position.set(-0.5 * totalWidth + letterPosX[i], 0, 0);
      });

      this.shouldUpdate = false;
    }
  }
}
