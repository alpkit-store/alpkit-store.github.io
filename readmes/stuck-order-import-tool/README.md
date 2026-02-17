# Orders Import Tool

A Windows PowerShell GUI application for finding and copying order XML files based on order numbers.

## Overview

The Orders Import Tool provides a user-friendly interface to:
- Paste a list of order numbers to search for
- Scan a folder containing XML files for matching orders
- Copy matched order files to a specified output folder
- View results with color-coded feedback (found, not found)

## Features

- **GUI Interface**: Simple Windows Forms-based UI for easy interaction
- **Batch Processing**: Find and copy multiple orders at once
- **Persistent Configuration**: Automatically saves selected source and destination folders
- **Visual Feedback**: Color-coded results display (green for found, red for not found, amber for warnings)
- **Order Number Normalization**: Automatically adds `#` prefix if missing
- **Duplicate Handling**: Removes duplicate order numbers from search
- **Safe Copying**: Confirmation dialog before copying files to prevent accidental overwrites

## Requirements

- Windows operating system
- PowerShell 5.0 or higher
- `.NET Framework` (for `System.Windows.Forms`)

## Installation

1. Clone or download this repository
2. Place `OrdersImportTool.ps1` in your desired directory
3. Run the script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\OrdersImportTool.ps1
   ```

## Usage

1. **Launch the application**: Run the script with PowerShell
2. **Enter order numbers**: Paste order numbers in the text box (one per line). The `#` prefix is optional
3. **Select source folder**: Click "Browse..." next to "Source folder" and select the folder containing XML files
4. **Specify output folder**: Click "Browse..." next to "Output subfolder" and select where copied files should go
5. **Find and copy**: Click the "Find and Copy" button to search for matching orders and copy them
6. **Review results**: The results panel shows which orders were found and which weren't
7. **Confirm copy**: A dialog will ask for confirmation before copying matched files

## Buttons

- **Find and Copy** (blue): Searches for order numbers in XML files and copies matched files to the output folder
- **Open Folder** (gray): Opens the output folder in Windows Explorer for quick access to copied files
- **Delete .cmp Files** (red): Removes all `.cmp` files from the output folder with confirmation

## Configuration

The tool automatically saves your folder selections to `OrdersImportTool.config.json` (not tracked in git). This file stores:
- `SourceFolder`: Path to the XML files directory
- `OutputFolder`: Path to the output directory

Configuration is updated whenever you change folder paths using the GUI.

## How It Works

1. Reads all XML files from the source folder
2. Extracts the `<ASSOCIATED_REF>` tag from each XML file
3. Matches extracted references against the provided order numbers
4. Reports matches and non-matches with color-coded feedback
5. Copies matched XML files to the output folder upon user confirmation

## File Structure

```
stuck-order-import-tool/
├── OrdersImportTool.ps1          # Main script
├── OrdersImportTool.config.json  # Configuration (auto-generated, ignored by git)
├── .gitignore                     # Git ignore rules
└── README.md                      # This file
```

## Limitations

- Only searches for XML files in the specified source folder (not recursive)
- Requires `<ASSOCIATED_REF>` tag in XML files for order matching
- Windows-only (uses PowerShell Forms and Windows APIs)
