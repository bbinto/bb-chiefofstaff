# PDF Export Feature

## Overview
The PDF export feature allows users to download any report as a high-quality PDF file directly from the frontend application.

## Features
- **One-click export**: Click the "Export PDF" button in the report viewer
- **High-quality rendering**: Uses html2canvas for accurate visual representation
- **Multi-page support**: Automatically handles reports that span multiple pages
- **Loading indicator**: Visual feedback during PDF generation
- **Automatic naming**: PDFs are named based on the report filename

## How to Use

### From the Frontend UI
1. Navigate to the Chief of Staff Reports dashboard
2. Click on any report to view it in full
3. In the report viewer header, click the **"Export PDF"** button
4. Wait for the PDF to generate (you'll see "Exporting..." during this process)
5. The PDF will automatically download to your browser's download folder

### Technical Details

#### Dependencies
- `jspdf` - PDF generation library
- `html2canvas` - HTML to canvas conversion for visual accuracy

#### File Location
- **PDF Export Utility**: `/frontend/src/utils/pdfExport.js`
- **Report Viewer Component**: `/frontend/src/components/ReportViewer.jsx`

#### Export Process
1. The report content is cloned to avoid modifying the original
2. Gradient text styling is converted to solid colors for better PDF rendering
3. The cleaned content is captured as a high-resolution canvas
4. Canvas is converted to PNG image
5. Image is embedded in a PDF with proper pagination
6. PDF is downloaded with the original report filename

#### PDF Features
- **Format**: A4 (210mm x 297mm)
- **Scale**: 2x for high resolution
- **Auto-pagination**: Content spanning multiple pages is automatically handled
- **Styling**: Preserves all markdown formatting, tables, and code blocks

## Customization

### Changing PDF Settings
Edit `/frontend/src/utils/pdfExport.js`:

```javascript
// Change PDF size
const pdf = new jsPDF('p', 'mm', 'letter'); // Use 'letter' instead of 'a4'

// Change image quality
const canvas = await html2canvas(clone, {
  scale: 3, // Increase from 2 to 3 for higher quality
  // ... other options
});
```

### Styling for PDF
The PDF export uses the same styling as the web view. To modify:
- Edit the ReportViewer component's className attributes
- Modify Tailwind classes in the prose styling

## Troubleshooting

### Gradient text appears as white/blank boxes
**Fixed!** The export now automatically converts gradient text to solid dark color (#1e293b) for proper PDF rendering.

### PDF is blank or has missing content
- Ensure the `id="report-content"` attribute exists on the content div
- Check browser console for errors
- Try refreshing the page and re-opening the report

### PDF quality is low
- Increase the `scale` parameter in `html2canvas` options (default is 2)
- Note: Higher scale = longer export time and larger file size

### Export is slow
- Large reports take longer to convert
- The loading indicator shows progress
- Consider using the simpler text-based export for very large reports

### Images don't appear in PDF
- Ensure `useCORS: true` is set in html2canvas options
- External images may need CORS headers

## Alternative Export Method

A simpler text-based PDF export is available as a fallback:

```javascript
import { exportToPDFSimple } from '../utils/pdfExport';

// Use like this:
await exportToPDFSimple(content, filename, agentName, timestamp);
```

This method:
- Exports plain text without styling
- Faster for large documents
- Smaller file size
- No image/styling support

## Future Enhancements

Potential improvements:
- [ ] Add PDF export option from the report list (batch export)
- [ ] Customize PDF header/footer with branding
- [ ] Add page numbers to multi-page PDFs
- [ ] Support exporting multiple reports as a single PDF
- [ ] Add PDF metadata (author, title, creation date)
- [ ] Email PDF directly from the app
- [ ] Cloud storage integration (save to Dropbox, Google Drive, etc.)
