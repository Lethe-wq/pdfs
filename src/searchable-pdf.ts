import { PDFDocument, TextRenderingMode, beginText, endText, setFontAndSize, setTextMatrix, setTextRenderingMode, showText, pushGraphicsState, popGraphicsState } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { TextLine } from './text-layout';
export async function addSearchableText(bytes:Uint8Array,layers:TextLine[][],fontBytes:Uint8Array,progress:(done:number,total:number)=>void=()=>{}):Promise<Uint8Array> {
  const pdf=await PDFDocument.load(bytes);
  if(layers.length!==pdf.getPageCount())throw new Error('文字层与 PDF 页面不匹配。');
  pdf.registerFontkit(fontkit);
  const font=layers.some(lines=>lines.some(line=>line.text.trim()))?await pdf.embedFont(fontBytes,{subset:true}):undefined;
  const supported=font?new Set(font.getCharacterSet()):undefined;
  for(let i=0;i<layers.length;i++) {
    const page=pdf.getPage(i);
    for(const line of layers[i]) {
      const text=line.text.trim();if(!text)continue;
      if([...text].some(c=>!supported!.has(c.codePointAt(0)!)))throw new Error(`第 ${i+1} 页包含当前字体不支持的字符，请修改或不添加此页文字。`);
      if(!(line.width>0&&line.height>0))throw new Error(`第 ${i+1} 页文字位置无效。`);
      const size=line.height,fontWidth=font!.widthOfTextAtSize(text,size),scale=line.width/Math.max(fontWidth,1);
      const m=line.matrix??[1,0,0,1,line.x,line.y];
      if(m.length!==6||m.some(v=>!Number.isFinite(v)))throw new Error('文字坐标无效。');
      // Each line has its own Unicode mapping and affine text matrix. The original page's /Rotate applies to both layers.
      const resource=page.node.newFontDictionary('OCR',font!.ref);
      page.pushOperators(pushGraphicsState(),beginText(),setFontAndSize(resource,size),setTextRenderingMode(TextRenderingMode.Invisible),
        setTextMatrix(m[0]*scale,m[1]*scale,m[2],m[3],m[4],m[5]),showText(font!.encodeText(text)),endText(),popGraphicsState());
    }
    progress(i+1,layers.length);
  }
  return pdf.save();
}
