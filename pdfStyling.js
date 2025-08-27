// Centralized PDF styling configuration
export const PDF_STYLING_CONFIG = {
  // Color palette for professional consulting firm aesthetic
  colors: {
    primary: '#1a365d',      // Deep Navy Blue
    secondary: '#3182ce',    // Accent Blue
    accent: '#38a169',       // Success Green
    warning: '#d69e2e',      // Warning Yellow
    error: '#e53e3e',        // Error Red
    text: {
      primary: '#1a365d',    // Main text color
      secondary: '#4a5568',  // Secondary text
      muted: '#718096',      // Muted text
      light: '#a0aec0'       // Light text
    },
    background: {
      primary: '#ffffff',    // White background
      secondary: '#f7fafc',  // Light gray background
      accent: '#ebf8ff',     // Light blue background
      header: '#1a365d'      // Header background
    },
    border: {
      light: '#e2e8f0',      // Light borders
      medium: '#cbd5e0',     // Medium borders
      dark: '#a0aec0'        // Dark borders
    }
  },
  
  // Typography system
  typography: {
    fonts: {
      heading: 'Helvetica-Bold',
      body: 'Helvetica',
      caption: 'Helvetica',
      accent: 'Helvetica-Bold'
    },
    sizes: {
      h1: 24,
      h2: 20,
      h3: 16,
      h4: 14,
      body: 11,
      caption: 9,
      small: 8
    },
    lineHeights: {
      tight: 1.2,
      normal: 1.4,
      relaxed: 1.6
    },
    weights: {
      normal: 'normal',
      medium: '500',
      bold: 'bold'
    }
  },
  
  // Spacing system
  spacing: {
    xs: 5,
    sm: 10,
    md: 15,
    lg: 20,
    xl: 30,
    xxl: 40,
    page: 50
  },
  
  // Layout configuration
  layout: {
    margins: {
      page: 20,
      section: 30,
      element: 15,
      card: 20
    },
    maxWidth: 500,
    grid: {
      columns: 12,
      gutter: 15
    },
    borderRadius: {
      small: 4,
      medium: 8,
      large: 12
    }
  }
};

// Utility functions for accessing configuration
export function getColor(colorPath) {
  return colorPath.split('.').reduce((obj, key) => obj[key], PDF_STYLING_CONFIG.colors);
}

export function getSpacing(size) {
  return PDF_STYLING_CONFIG.spacing[size] || PDF_STYLING_CONFIG.spacing.md;
}

export function getTypography(type, property) {
  return PDF_STYLING_CONFIG.typography[type][property];
}

// Professional styling helper functions for PDFKit
export function createProfessionalHeader(doc, title, subtitle = null) {
  doc.save();
  
  // Header background
  doc.rect(0, 0, doc.page.width, 80)
     .fill(PDF_STYLING_CONFIG.colors.background.header);
  
  // Title
  doc.font(PDF_STYLING_CONFIG.typography.fonts.heading)
     .fontSize(PDF_STYLING_CONFIG.typography.sizes.h1)
     .fillColor('white')
     .text(title, PDF_STYLING_CONFIG.layout.margins.page, 25, {
       width: doc.page.width - (PDF_STYLING_CONFIG.layout.margins.page * 2)
     });
  
  // Subtitle
  if (subtitle) {
    doc.font(PDF_STYLING_CONFIG.typography.fonts.body)
       .fontSize(PDF_STYLING_CONFIG.typography.sizes.body)
       .fillColor(PDF_STYLING_CONFIG.colors.text.light)
       .text(subtitle, PDF_STYLING_CONFIG.layout.margins.page, 55, {
         width: doc.page.width - (PDF_STYLING_CONFIG.layout.margins.page * 2)
       });
  }
  
  doc.restore();
  
  // Return new Y position after header
  return 100;
}

export function createMetricCard(doc, title, value, x, y, width = 150, height = 80) {
  doc.save();
  
  // Card background with shadow effect
  doc.rect(x, y, width, height)
     .fill(PDF_STYLING_CONFIG.colors.background.primary)
     .stroke(PDF_STYLING_CONFIG.colors.border.light);
  
  // Title
  doc.font(PDF_STYLING_CONFIG.typography.fonts.body)
     .fontSize(PDF_STYLING_CONFIG.typography.sizes.caption)
     .fillColor(PDF_STYLING_CONFIG.colors.text.secondary)
     .text(title, x + 15, y + 15, {
       width: width - 30
     });
  
  // Value
  doc.font(PDF_STYLING_CONFIG.typography.fonts.accent)
     .fontSize(PDF_STYLING_CONFIG.typography.sizes.h3)
     .fillColor(PDF_STYLING_CONFIG.colors.text.primary)
     .text(value, x + 15, y + 35, {
       width: width - 30
     });
  
  doc.restore();
  
  // Return new Y position after card
  return y + height + PDF_STYLING_CONFIG.spacing.md;
}

export function createSectionHeader(doc, title, y) {
  doc.save();
  
  // Section title
  doc.font(PDF_STYLING_CONFIG.typography.fonts.heading)
     .fontSize(PDF_STYLING_CONFIG.typography.sizes.h2)
     .fillColor(PDF_STYLING_CONFIG.colors.text.primary)
     .text(title, PDF_STYLING_CONFIG.layout.margins.page, y);
  
  // Underline
  const textWidth = doc.widthOfString(title);
  doc.strokeColor(PDF_STYLING_CONFIG.colors.secondary)
     .lineWidth(2)
     .moveTo(PDF_STYLING_CONFIG.layout.margins.page, y + 25)
     .lineTo(PDF_STYLING_CONFIG.layout.margins.page + textWidth, y + 25)
     .stroke();
  
  doc.restore();
  
  // Return new Y position after section header
  return y + 40;
}
