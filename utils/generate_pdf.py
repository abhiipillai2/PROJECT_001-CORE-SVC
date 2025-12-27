import sys
from weasyprint import HTML, CSS

def generate_pdf(html_input, output_file, poppins_regular, poppins_medium, poppins_bold):
    # Define page size and margin
    page_style = CSS(string='''
        @page {
            size: A4;
            margin: 0.2in 0.3in 0.1in 0.1in;
        }
        html, body {
            width: 100%;
            margin: 0;
            padding: 0;
        }
    ''')

    # Build the font-face CSS dynamically
    font_face_css = f'''
        @font-face {{
            font-family: 'Poppins';
            src: url('{poppins_regular}') format('truetype');
            font-weight: 400;
        }}

        @font-face {{
            font-family: 'Poppins';
            src: url('{poppins_medium}') format('truetype');
            font-weight: 500;
        }}

        @font-face {{
            font-family: 'Poppins';
            src: url('{poppins_bold}') format('truetype');
            font-weight: 700;
        }}
    '''

    # Additional layout styles
    extra_style = f'''
        <style>
        {font_face_css}

        body {{
            font-family: 'Poppins', sans-serif;
            font-size: 13px;
            margin: 0;
            padding: 0;
        }}

        .invoice-container {{
            width: 100%;
            max-width: 790px;
            margin: 0 auto;
            padding: 20px;
            box-sizing: border-box;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-top: 10px;
            word-wrap: break-word;
        }}

        th, td {{
            padding: 6px;
            text-align: center;
            border: 1px solid #000;
            font-size: 11px;
        }}

        th {{
            font-weight: bold;
            background-color: #e6e8f7;
            word-break: break-word;
            white-space: normal;
        }}

        .bold {{
            font-weight: 700;
        }}

        .footer {{
            margin-top: 30px;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
        }}

        .bank-details {{
            font-size: 12px;
        }}

        .text-right {{
            text-align: right;
        }}
    </style>
    '''

    # Inject CSS into HTML
    if '</head>' in html_input:
        html_input = html_input.replace('</head>', f'{extra_style}</head>')
    elif '</body>' in html_input:
        html_input = html_input.replace('</body>', f'{extra_style}</body>')
    else:
        html_input = extra_style + html_input

    # Ensure images have correct sizing
    html_input = html_input.replace('<img', '<img class="qr-code"')

    # Generate PDF
    HTML(string=html_input, base_url='.').write_pdf(output_file, stylesheets=[page_style])
    print("PDF generated:", output_file)

if __name__ == '__main__':
    if len(sys.argv) != 6:
        print("Usage: generate_pdf.py <input.html> <output.pdf> <poppins_regular> <poppins_medium> <poppins_bold>")
        sys.exit(1)

    html_file = sys.argv[1]
    output_file = sys.argv[2]
    poppins_regular = sys.argv[3]
    poppins_medium = sys.argv[4]
    poppins_bold = sys.argv[5]

    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()

    generate_pdf(html_content, output_file, poppins_regular, poppins_medium, poppins_bold)