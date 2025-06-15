const XLSX = require('xlsx');
const path = require('path');

console.log('🔍 分析 output.xlsx 模板文件...\n');

try {
  const templatePath = path.join(__dirname, 'output.xlsx');
  const workbook = XLSX.readFile(templatePath);
  
  console.log('📋 工作表名称:', workbook.SheetNames);
  
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  
  console.log('\n📊 重要单元格内容:');
  
  // 检查关键单元格
  const keyCells = [
    'A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1',
    'A5', 'B5', 'C5', 'D5', 'E5', 'F5', 'G5',
    'A9', 'B9', 'C9', 'D9', 'E9', 'F9', 'G9',
    'A10', 'B10', 'C10', 'D10', 'E10', 'F10', 'G10',
    'A11', 'B11', 'C11', 'D11', 'E11', 'F11', 'G11',
    'A12', 'B12', 'C12', 'D12', 'E12', 'F12', 'G12'
  ];
  
  keyCells.forEach(cell => {
    if (worksheet[cell]) {
      console.log(`${cell}: "${worksheet[cell].v}" (类型: ${worksheet[cell].t})`);
    } else {
      console.log(`${cell}: [空]`);
    }
  });
  
  console.log('\n🔍 工作表范围:', worksheet['!ref']);
  
  // 检查合并单元格
  if (worksheet['!merges']) {
    console.log('\n🔗 合并单元格:');
    worksheet['!merges'].forEach((merge, index) => {
      console.log(`${index + 1}: ${XLSX.utils.encode_range(merge)}`);
    });
  }
  
  // 检查列宽
  if (worksheet['!cols']) {
    console.log('\n📏 列宽设置:');
    worksheet['!cols'].forEach((col, index) => {
      if (col.wch) {
        console.log(`列 ${String.fromCharCode(65 + index)}: 宽度 ${col.wch}`);
      }
    });
  }
  
  // 检查行高
  if (worksheet['!rows']) {
    console.log('\n📐 行高设置:');
    worksheet['!rows'].forEach((row, index) => {
      if (row.hpt) {
        console.log(`行 ${index + 1}: 高度 ${row.hpt}`);
      }
    });
  }
  
  console.log('\n✅ 分析完成');
  
} catch (error) {
  console.error('❌ 分析失败:', error);
} 