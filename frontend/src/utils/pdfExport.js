import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Export report content to PDF
 * @param {string} filename - The name of the report file
 * @param {string} agentName - The agent name for the PDF title
 * @param {string} timestamp - The timestamp for the report
 */
export const exportToPDF = async (filename, agentName, timestamp) => {
  try {
    // Get the report content element
    const reportElement = document.getElementById('report-content');

    if (!reportElement) {
      throw new Error('Report content not found');
    }

    // Show loading state (optional - you can add a callback for this)
    const loadingElement = document.createElement('div');
    loadingElement.id = 'pdf-loading';
    loadingElement.className = 'fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center z-50';
    loadingElement.innerHTML = `
      <div class="bg-white rounded-lg p-6 shadow-xl">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
        <p class="text-gray-700">Generating PDF...</p>
      </div>
    `;
    document.body.appendChild(loadingElement);

    // Clone the element to avoid modifying the original
    const clone = reportElement.cloneNode(true);
    clone.style.width = '800px';
    clone.style.padding = '40px';
    clone.style.backgroundColor = 'white';

    // Remove gradient text styling that doesn't render well in PDF
    // Find all elements with gradient text and convert to solid color
    const gradientElements = clone.querySelectorAll('[class*="bg-gradient"], [class*="bg-clip-text"]');
    gradientElements.forEach((el) => {
      // Remove gradient classes
      el.style.backgroundImage = 'none';
      el.style.backgroundClip = 'unset';
      el.style.webkitBackgroundClip = 'unset';
      el.style.color = '#1e293b'; // Use solid dark color instead
      el.style.textFillColor = 'unset';
      el.style.webkitTextFillColor = 'unset';
    });

    // Fix heading styles for PDF
    const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading) => {
      heading.style.backgroundImage = 'none';
      heading.style.backgroundClip = 'unset';
      heading.style.webkitBackgroundClip = 'unset';
      heading.style.color = '#1e293b';
      heading.style.textFillColor = 'unset';
      heading.style.webkitTextFillColor = 'unset';
      heading.style.fontWeight = 'bold';
    });

    // Ensure background is solid white
    clone.style.background = 'white';
    const innerDiv = clone.querySelector('.prose');
    if (innerDiv) {
      innerDiv.style.background = 'white';
    }

    // Temporarily add to DOM for rendering
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    document.body.appendChild(clone);

    // Convert to canvas with high quality settings
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 800,
    });

    // Remove clone
    document.body.removeChild(clone);

    // Calculate PDF dimensions
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;

    // Create PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    let position = 0;

    // Add first page
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      0,
      position,
      imgWidth,
      imgHeight
    );
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        position,
        imgWidth,
        imgHeight
      );
      heightLeft -= pageHeight;
    }

    // Generate filename
    const pdfFilename = filename.replace('.md', '.pdf') || `${agentName}-${timestamp}.pdf`;

    // Save PDF
    pdf.save(pdfFilename);

    // Remove loading state
    document.body.removeChild(loadingElement);

    return { success: true, filename: pdfFilename };
  } catch (error) {
    console.error('PDF export error:', error);

    // Remove loading state if it exists
    const loadingElement = document.getElementById('pdf-loading');
    if (loadingElement) {
      document.body.removeChild(loadingElement);
    }

    throw error;
  }
};

/**
 * Alternative PDF export using a simpler approach (text-based)
 * This is a fallback for cases where html2canvas might have issues
 */
export const exportToPDFSimple = async (content, filename, agentName, timestamp) => {
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);

    // Add title
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text(`Chief of Staff Report - ${agentName}`, margin, margin);

    // Add timestamp
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.text(`Generated: ${timestamp}`, margin, margin + 10);

    // Add content
    pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(content, maxWidth);

    let y = margin + 20;
    lines.forEach((line) => {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += 7;
    });

    // Save
    const pdfFilename = filename.replace('.md', '.pdf') || `${agentName}-${timestamp}.pdf`;
    pdf.save(pdfFilename);

    return { success: true, filename: pdfFilename };
  } catch (error) {
    console.error('Simple PDF export error:', error);
    throw error;
  }
};
