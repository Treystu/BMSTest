# **App Name**: Insight Extractor

## Core Features:

- Image Upload: Upload images for data extraction. Accepts common image formats.
- Data Extraction Tool: Use OCR to extract text and numerical data from the uploaded image. LLM tool to interpret, extract, and structure data such as SOC, Voltage, Current, Capacity, Temperatures, and other metrics.
- Data Visualization: Display extracted data in a clear and intuitive format, including a time-based trend chart. Automatically extract timestamp information if available, otherwise default to time of ingestion. Display voltage, current, temperature, and capacity as trendlines. 
- Metric Selection: Enable users to select specific metrics for display in the chart, and toggle on or off
- Time Range Selection: Allow users to choose a specific time range for the trend chart, with sensible presets (1 hour, 1 day, 1 week, 1 month, all).

## Style Guidelines:

- Primary color: Deep Blue (#3F51B5) to represent stability and trustworthiness in data representation. 
- Background color: Very light grey (#F0F0F0), almost white.
- Accent color: Teal (#009688) for interactive elements and highlights, providing a modern, tech-oriented feel.
- Body and headline font: 'Inter' (sans-serif) for clean and modern readability of data and labels. Note: currently only Google Fonts are supported.
- Use minimalist, line-style icons to represent different metrics (voltage, current, temperature, etc.).
- Divide the layout into clear sections: Image upload area, data display, chart, and controls (metric selection, time range). Use a card-based layout.
- Use subtle animations when loading and updating the chart with new data.