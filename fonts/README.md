# Fonts Directory

This directory should contain the **OpenSans-Bold.ttf** font file for subtitle rendering.

## How to obtain OpenSans-Bold.ttf

### Option 1: Download from Google Fonts (Recommended)
1. Visit: https://fonts.google.com/specimen/Open+Sans
2. Click "Download family" button
3. Extract the ZIP file
4. Find `OpenSans-Bold.ttf` in the `static/` folder
5. Copy it to this directory: `/workspace/cmlukav4z0020itpj7o6tadb7/clipper-ai-viral-be/fonts/OpenSans-Bold.ttf`

### Option 2: Use system font
If you have Open Sans installed on your system:
- **macOS**: `/Library/Fonts/OpenSans-Bold.ttf` or `~/Library/Fonts/OpenSans-Bold.ttf`
- **Linux**: `/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf`
- **Windows**: `C:\Windows\Fonts\OpenSans-Bold.ttf`

Copy the file to this directory.

### Option 3: Use alternative Bold font
If Open Sans Bold is not available, you can use any bold .ttf font file. Just rename it to `OpenSans-Bold.ttf` and place it here.

## After adding the font

The server will automatically detect the font file and use it for subtitle rendering with:
- Font: Open Sans Bold
- Outline: Black 3px thick
- Colors: White (#FFFFFF) for normal words, Yellow (#FFD700) for keywords

## Fallback behavior

If `OpenSans-Bold.ttf` is not found, the server will:
- Use ffmpeg's default system font (usually Sans or Arial)
- Log a warning message on startup
- Subtitle rendering will still work, just with a different font
