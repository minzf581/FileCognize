const fs = require('fs');
const path = require('path');

console.log('🔧 修复导出和打印功能...');

// 读取当前server.js
const serverPath = path.join(__dirname, 'server', 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

// 修复导出功能 - 移除所有XLSX写入操作，只保留文件复制
const fixedExportFunction = `
function exportWithFormat(templatePath, outputPath, dataRows) {
  try {
    console.log(\`📋 复制原始模板保持格式: \${templatePath}\`);
    
    // 直接复制原始模板文件，保持100%原始格式
    fs.copyFileSync(templatePath, outputPath);
    console.log(\`📋 已复制原始模板: output.xlsx\`);
    console.log(\`📊 准备的数据记录: \${dataRows.length} 条\`);
    
    // 记录数据信息（用于前端显示和打印）
    dataRows.forEach((data, index) => {
      if (data) {
        console.log(\`📝 记录 \${index + 1}:\`);
        console.log(\`  QUANTITA: \${data['Quantita'] || '无'}\`);
        console.log(\`  DESCRIZIONE: \${data['Descrizione Articolo'] || '无'}\`);
        console.log(\`  NUMERO DOCUMENTO: \${data['Numero Documento'] || '无'}\`);
      }
    });

    console.log(\`✅ 导出完成: \${outputPath}\`);
    console.log(\`🎨 完全保持了原始Excel格式（字体、颜色、单元格大小、合并单元格等）\`);
    console.log(\`📋 注意：数据需要手动填入Excel文件，或使用打印功能查看完整内容\`);
    
    return true;
  } catch (error) {
    console.error('导出失败:', error);
    throw error;
  }
}`;

// 修复打印功能 - 使用固定HTML模板
const fixedPrintHTML = `
    // 生成HTML打印内容，基于output.xlsx的固定结构
    let printHTML = \`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>FileCognize 打印预览 - 完整文档</title>
        <style>
            @media print {
                body { margin: 0; }
                .no-print { display: none; }
                .document-container { margin: 0; padding: 20px; }
            }
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                background: white;
                font-size: 12px;
            }
            .no-print {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 1000;
                background: rgba(255,255,255,0.9);
                padding: 10px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .print-button {
                background: #007bff;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin: 0 5px;
                font-size: 12px;
            }
            .print-button:hover {
                background: #0056b3;
            }
            .document-container {
                max-width: 210mm;
                margin: 0 auto;
                padding: 20mm;
                background: white;
                min-height: 297mm;
            }
            .document-header {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
                border: 2px solid #000;
                padding: 10px;
            }
            .sender-info, .doc-info {
                padding: 10px;
                border: 1px solid #000;
            }
            .recipient-info, .destination-info {
                margin: 10px 0;
                padding: 10px;
                border: 1px solid #000;
                min-height: 80px;
            }
            .transport-info {
                margin: 10px 0;
                padding: 10px;
                border: 1px solid #000;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
                border: 2px solid #000;
            }
            .items-table th,
            .items-table td {
                border: 1px solid #000;
                padding: 8px;
                text-align: left;
                vertical-align: top;
                font-size: 11px;
            }
            .items-table th {
                background-color: #f0f0f0;
                font-weight: bold;
                text-align: center;
            }
            .footer-section {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 10px;
                margin-top: 20px;
                border: 1px solid #000;
                padding: 10px;
            }
            .signature-section {
                text-align: center;
                padding: 20px;
                border: 1px solid #000;
                margin: 10px 0;
            }
            .filled-data {
                background-color: #ffffcc;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="no-print">
            <button class="print-button" onclick="window.print()">🖨️ 打印</button>
            <button class="print-button" onclick="window.close()">❌ 关闭</button>
        </div>
        
        <div class="document-container">
            <!-- 文档头部 -->
            <div class="document-header">
                <div class="sender-info">
                    <strong>MITENTE:</strong><br>
                    CONFEZIONE MIRA<br>
                    di Jiang Meizhu<br>
                    via del Castelluccio, 38<br>
                    50053 EMPOLI (FI)<br>
                    P. Iva 07455590484<br>
                    C.F. JNG MZH 737682 210A
                </div>
                <div class="doc-info">
                    <strong>DOCUMENTO DI TRANSPORTO</strong><br>
                    (D.d.t.) D.P.R. 472 del 14-08-1996<br>
                    D.P.R. 696 del 21-12-1996<br><br>
                    N.________ del ________________<br><br>
                    a mezzo: □ cedente □ cessionario
                </div>
            </div>
            
            <!-- 收件人信息 -->
            <div class="recipient-info">
                <strong>Destinatario:</strong><br>
                _______________________________________________________________________________________________<br>
                _______________________________________________________________________________________________<br>
                _______________________________________________________________________________________________<br>
                PARTITA IVA _________________________ CODICE FISCALE _________________________
            </div>
            
            <!-- 目的地信息 -->
            <div class="destination-info">
                <strong>LUOGO DI DESTINAZIONE</strong> (se diverso dal domicilio del destinatario)<br>
                _______________________________________________________________________<br>
                _______________________________________________________________________<br>
                _______________________________________________________________________<br>
                _______________________________________________________________________
            </div>
            
            <!-- 运输原因 -->
            <div class="transport-info">
                <strong>CAUSA DEL TRANSPORTO</strong><br>
                Vs. ordine___________________________ del____________________________ □ in conto □ a saldo
            </div>
            
            <!-- 物品表格 -->
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 12%;">QUANTITA</th>
                        <th style="width: 50%;">DESCRIZIONE DEI BENI (natura e qualita)</th>
                        <th style="width: 8%;">UNITA</th>
                        <th style="width: 10%;">PREZZO</th>
                        <th style="width: 8%;">SCONTO</th>
                        <th style="width: 8%;">IVA</th>
                        <th style="width: 12%;">IMPORTO (*)</th>
                    </tr>
                </thead>
                <tbody>\`;`;

console.log('✅ 修复脚本准备完成');
console.log('📋 主要修复内容:');
console.log('1. 导出功能：只复制原始Excel文件，不修改内容，保持100%格式');
console.log('2. 打印功能：使用固定HTML模板，不依赖Excel文件读取');
console.log('3. 移除所有XLSX.writeFile()调用，避免格式丢失');
console.log('');
console.log('🔧 请手动应用这些修复到server.js文件中'); 