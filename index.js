const express = require('express');
const sharp = require('sharp');
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const port = process.env.PORT || 3000; // Use Heroku's dynamic port or 3000 if locally


const app = express();
const port = 3000;

async function fetchLogoFromClearbit(domainName) {
    const endpoint = `https://logo.clearbit.com/${domainName}`;
    try {
        console.log(`Fetching logo for domain: ${domainName}`); // Log the domain name
        const response = await axios.get(endpoint, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        console.warn(`Failed to fetch logo for domain: ${domainName}`);
        return null;
    }
}

function readDomainsFromSpreadsheet() {
    const workbook = XLSX.readFile(path.join(__dirname, 'companies.xlsx'));
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
  
    return data
        .map(row => row.Domain)
        .filter(domain => domain)
        .map(domain => "www." + domain);
}

function createDirectoryIfNotExists(directoryPath) {
    try {
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });  // Make sure it's recursive
            console.log(`Directory ${directoryPath} created.`);
            return true;
        }
    } catch (error) {
        console.error(`Error creating directory ${directoryPath}:`, error);
    }
    return false;
}

app.get('/generate', async (req, res) => {
    try {
        const companyDomains = readDomainsFromSpreadsheet();
        const limit = 10;  // Limit to the first 10 companies

        for (let i = 0; i < Math.min(companyDomains.length, limit); i++) {
            const domain = companyDomains[i];
            const directoryPath = path.join(__dirname, domain);

            if (!createDirectoryIfNotExists(directoryPath)) {
                console.log(`Skipping ${domain} due to directory creation issues.`);
                continue;
            }

            const logoBuffer = await fetchLogoFromClearbit(domain);
            if (!logoBuffer) {
                console.warn(`No logo found for domain: ${domain}`);
                continue;
            }

            const outputImagePath = path.join(directoryPath, `output_${domain}.jpg`);
            await sharp(path.join(__dirname, 'background.jpg'))
                .composite([{ input: logoBuffer, gravity: 'east' }])
                .toFile(outputImagePath);
        }

        res.send(`Generated images for companies.`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to generate images.');
    }
});

app.get('/images', (req, res) => {
    const directories = fs.readdirSync(__dirname, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(name => fs.existsSync(path.join(__dirname, name, `output_${name}.jpg`)));

    let html = '<h2>Generated Images:</h2><ul>';
    directories.forEach(directory => {
        html += `<li><a href="/images/${directory}">${directory}</a></li>`;
    });
    html += '</ul>';

    res.send(html);
});

app.get('/images/:domain', (req, res) => {
    const domain = req.params.domain;
    const imagePath = path.join(__dirname, domain, `output_${domain}.jpg`);
    if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
    } else {
        res.status(404).send('Image not found');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
