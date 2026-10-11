import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat } from 'docx';
import { paragraphs } from './text-layout.ts';
import type { WordPage } from './word-protocol';

export async function generateWord(pages: WordPage[], progress: (done: number, total: number) => void = () => {}): Promise<ArrayBuffer> {
  if (!pages.length || pages.some(page => !page.lines.length || page.lines.some(line => !line.trim()))) throw new Error('没有有效的文字页面，请重新检查。');
  const children: Paragraph[] = [];
  pages.forEach((page, index) => {
    const blocks = page.layout ? paragraphs(page.layout, page.originalLines) : page.lines.map(text => ({text,style:'body' as const}));
    blocks.forEach((block,lineIndex) => {
      const heading = block.style === 'heading1' || block.style === 'heading2';
      const list = block.style === 'number' || block.style === 'bullet';
      const text = list ? block.text.replace(/^\s*(?:[•●▪\-]\s+|\d+[.)、]\s*|[一二三四五六七八九十]+[、.]\s*)/, '') : block.text;
      children.push(new Paragraph({
        pageBreakBefore:index > 0 && lineIndex === 0,
        heading:block.style === 'heading1' ? HeadingLevel.HEADING_1 : block.style === 'heading2' ? HeadingLevel.HEADING_2 : undefined,
        numbering:list ? {reference:block.style === 'number' ? `number-${index}` : 'bullet',level:0} : undefined,
        spacing:{after:120,line:276},
        children:[new TextRun({text,size:heading ? (block.style === 'heading1' ? 32 : 28) : 22,bold:heading,
          font:{ascii:'Arial',hAnsi:'Arial',eastAsia:'宋体'}})],
      }));
    });
    progress(index + 1, pages.length);
  });
  const document = new Document({ creator: '页序 · PDF 工作台', title: 'PDF 转 Word', numbering:{config:[
    {reference:'bullet',levels:[{level:0,format:LevelFormat.BULLET,text:'•',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}}]},
    ...pages.map((_,index)=>({reference:`number-${index}`,levels:[{level:0,format:LevelFormat.DECIMAL,text:'%1.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}}]})),
  ]}, sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children,
  }] });
  return Packer.toArrayBuffer(document);
}
