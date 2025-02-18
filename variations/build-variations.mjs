import fs from 'fs-extra';
import fsorig from 'fs';
import deepmerge from 'deepmerge';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { executeCommand, getThemeMetadata } from '../theme-utils.mjs';

const localpath = dirname( fileURLToPath( import.meta.url ) );
const args = process.argv.slice(2);

async function start() {
	let source = args?.[0];
	let variation = args?.[1];
	if ( source && variation ) {
		return await buildVariation(source, variation);
	}
	return await buildAllVariations();
}

start();

async function buildAllVariations(){
	for (let source of getDirectories( localpath )){
		for (let variation of getDirectories( `${localpath}/${source}` )){
			await buildVariation(source, variation);
		}
	}
}

async function buildVariation(source, variation) {
	const srcDir = localpath + '/../' + source;
	const srcVariationDir = localpath + '/' + source + '/' + variation;
	const destDir = localpath + '/../' + variation;

	console.log( `Copying the source ${source} to the variation ${variation}` );

	try {
		// First grab the existing version if the variation exists already
		let variationExists = fs.existsSync(`${destDir}/style.css`);
		let currentVersion = null;

		if( variationExists ) {
			let styleCss = fs.readFileSync(`${destDir}/style.css`, 'utf8');
			currentVersion = getThemeMetadata(styleCss, 'Version');
		}

		// then empty the old directory.
		await fs.emptyDir( destDir );

		const exclude = [ 'node_modules', 'styles', 'sass', 'package.json', 'package-lock.json' ];

		// Then copy the source directory.
		await fs.copy( srcDir, destDir, {
			filter: (fileName) => {
				if (exclude.some( ignore => fileName.includes( ignore ) )){
					return false;
				}
				return true;
			}
		});

		// copy the variation directory.
		await fs.copy( srcVariationDir, destDir );

		// copy the readme
		await fs.copy( localpath + '/variation-readme.md', destDir + '/variation-readme.md' );

		// merge the theme.json files
		const srcJsonFile = await fs.readFile( srcDir + '/theme.json', 'utf8' );
		const srcVariationJsonFile = await fs.readFile( srcVariationDir + '/theme.json', 'utf8' )
		const srcJson = JSON.parse( srcJsonFile );
		const srcVariationJson = JSON.parse( srcVariationJsonFile );
		const mergedJson = deepmerge(srcJson, srcVariationJson, {
			arrayMerge: ( dest, source ) => source
		});
		await fs.writeFile ( destDir + '/theme.json', JSON.stringify( mergedJson, null, '\t' ), 'utf8' );

		// replace the with current version
		if ( currentVersion != null ) {
			await executeCommand(`perl -pi -e 's/Version: (.*)$/"Version: '${currentVersion}'"/ge' ${destDir}/style.css`);
		}

		if ( args[0] == 'git-add-changes') {
			await executeCommand(`git add ${destDir}`, true);
		}
	
		console.log('Finished sucessfully.\n\n');
	}
	catch (err){
		console.log('ERROR: ', err, '\n\n');
	}
}

function getDirectories ( path ) {
	return fsorig.readdirSync( path, { withFileTypes: true } )
		.filter( item => item.isDirectory() )
		.map ( item => item.name )
}

function getTemplates ( path ) {
	return fsorig.readdirSync( path, { withFileTypes: true } )
		.map ( item => item.name )
}

function modifyTemplates ( from, to, basePath ) {
	console.log('modifying templates changing ', from, 'to', to);
	const templates = getTemplates(basePath);
	for ( let template of templates ) {
		let templatePath = basePath + '/' + template;
		let srcTemplate = fs.readFileSync( templatePath, 'utf8' );
		let resultTemplate = srcTemplate.replace(from, to);
		fs.writeFileSync ( templatePath, resultTemplate, 'utf8' );
	}
}