import { App, Modal, Notice, Plugin, PluginSettingTab, Setting,TFile,FrontMatterCache } from 'obsidian';
import * as Papa from 'papaparse';
import * as yaml from 'js-yaml';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	hoursPerTomato: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	hoursPerTomato: 0.5
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		const reportIcon = this.addRibbonIcon('calendar-clock', 'Report today\'s progress', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			reportButtonClicked(this.settings.hoursPerTomato);
		});

		const cleanUpTodayIcon = this.addRibbonIcon('calendar-x', 'Clean up today\'s progress', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			cleanUpTodaysProgress()
		});

		reportIcon.addClass('my-plugin-ribbon-class');
		cleanUpTodayIcon.addClass('my-plugin-ribbon-class');


		

		// // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');

		// // This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'open-sample-modal-simple',
		// 	name: 'Open sample modal (simple)',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	}
		// });
		// // This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: 'sample-editor-command',
		// 	name: 'Sample editor command',
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		editor.replaceSelection('Sample Editor Command');
		// 	}
		// });
		// // This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: 'open-sample-modal-complex',
		// 	name: 'Open sample modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	}
		// });

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// // Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Hours per tomato')
			.setDesc('How many hours will be reported per one pomodoro')
			.addText(text => text
				.setPlaceholder('number')
				.setValue(this.plugin.settings.hoursPerTomato.toString())
				.onChange(async (value) => {
					this.plugin.settings.hoursPerTomato = Number(value);
					await this.plugin.saveSettings();
				}));
	}
}


function reportButtonClicked(hoursPerTomato: number) {

	let tomatoesFinished: TaskMap  = {};
	let files: TFile[]=this.app.vault.getMarkdownFiles()
	for (let file of files) {
		let frontmatter: FrontMatterCache|undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) {
			continue
		}
		if (frontmatter.pageType !== "project"){
			continue
		}

		if (frontmatter.doneToday) {
			tomatoesFinished[frontmatter.reportKey]=frontmatter.doneToday;
		} else {
			var totalTomatoes = 0

			let mainReportKey = frontmatter.reportKey
			let map = new Map(Object.entries(frontmatter))
			map.forEach((value: any, key: string) => {
				if (!key.endsWith("_sub_done_today")) {
					return
				}
				let subProjKey = key.replace("_sub_done_today", "");
				tomatoesFinished[mainReportKey+":"+subProjKey] = Number(value)
				totalTomatoes+=Number(value)
			});

			tomatoesFinished[frontmatter.reportKey] = totalTomatoes
		}
	}

	appendToCSV(hoursPerTomato, tomatoesFinished, "time_statistics_report.csv")
}


type TaskMap = { [key: string]: number };

function appendToCSV(hoursPerTomato: number, taskMap: TaskMap, filePath: string): void {

	const csvFile = this.app.vault.getAbstractFileByPath(filePath);
	if (csvFile) {

		let existingHeaders: Set<string> = new Set();

		if (csvFile instanceof TFile) {
			const fileProm: Promise<string> = this.app.vault.read(csvFile);
			fileProm.then((text:string)=>{
				let parsedData = Papa.parse(text, { header: true })
				let csvData = (parsedData.data as Array<Record<string, string | number>>) || [];

				// if we add new headers we should add it to each row, otherwise it won't appear
				if (parsedData.meta && parsedData.meta.fields) {
					existingHeaders = new Set(parsedData.meta.fields)
				}
				const newHeaders = Object.keys(taskMap).filter(key => !existingHeaders.has(key));
				newHeaders.forEach(header => {
					csvData.forEach(row => {
						row[header] = 0.0;
					});
				});

				writeParsedData(filePath, csvFile, hoursPerTomato, taskMap, csvData)
			})
		} else {
			new Notice("something bad, csv is not a file")
			return
		}
	} else {
		writeParsedData(filePath, undefined, hoursPerTomato,taskMap,[])
	}
  }

  function writeParsedData(filePath: string, csvFile: TFile|undefined, hoursPerTomato: number, taskMap: TaskMap, csvData: Array<Record<string, string | number>>) {
	const currentDate = new Date().toISOString().split('T')[0]; // Get today's date

	// Find the index of the row with today's date or -1 if not found
	const rowIndex = csvData.findIndex(row => row['date'] === currentDate);
	
	
	// If today's date exists, update the row; otherwise, create a new row
	if (rowIndex !== -1) {
		// Update existing row with today's date
		const existingRow = csvData[rowIndex];
		Object.keys(existingRow).forEach((key:string, index: number)=>{
			if (index == 0) {return}
			existingRow[key] = 0.0
		})
		Object.keys(taskMap).forEach((key:string) => {
			existingRow[key] = taskMap[key] * hoursPerTomato;
		});
	} else {
		// Create a new row with today's date
		const newRow: Record<string, string | number> = { date: currentDate };
		Object.keys(taskMap).forEach(key => {
			newRow[key] = taskMap[key] * hoursPerTomato;
		});
		csvData.push(newRow);
	}

	// Write the updated data back to the CSV file
	const csvString = Papa.unparse(csvData, { header: true });
	if (csvFile){
		this.app.vault.modify(csvFile, csvString)
	} else {
		this.app.vault.create(filePath, csvString)
	}

	new Notice("Report finished\n" + currentDate + "\nhours per tomato: "+ hoursPerTomato + "\n"+ JSON.stringify(taskMap));
  }


function cleanUpTodaysProgress(){

	// let tomatoesFinished: TaskMap  = {};
	let filesToCleanUp: TFile[] = []
	let files: TFile[]=this.app.vault.getMarkdownFiles()

	for (let file of files) {
		let frontmatter: FrontMatterCache|undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) {
			continue
		}
		if (frontmatter.pageType !== "project"){
			continue
		}
		filesToCleanUp.push(file)
	}

	new Notice("start cleaning up " + filesToCleanUp.length + " files")

	for (let file of filesToCleanUp) {
		resetYAMLProperties(file)
	}
}

interface Frontmatter {
    doneToday?: number;
    [key: string]: any;
}

function parseFrontmatter(fileContent: string): { frontmatter: Frontmatter; content: string } {
    const regex = /^---\n([\s\S]*?)\n---\n([\s\S]*)/;
    const match = regex.exec(fileContent);
    if (match) {
        const frontmatter = match[1];
        const content = match[2];
        const frontmatterObject = (yaml.load(frontmatter) as Frontmatter);
        return { frontmatter: frontmatterObject, content };
    } else {
        throw new Error('Frontmatter not found in file');
    }
}

function stringifyFrontmatter(frontmatter: Frontmatter): string {
    return `---\n${yaml.dump(frontmatter)}---\n`;
}

function resetYAMLProperties(file: TFile): void {
	const fileProm: Promise<string> = this.app.vault.read(file);
	fileProm.then((fileContent:string)=>{
		const { frontmatter, content } = parseFrontmatter(fileContent);

		if (frontmatter.hasOwnProperty('doneToday')) {
			if (frontmatter.doneToday == 0) {
				return
			}
            frontmatter.doneToday = 0;
        } else {
            // Reset all subprojects
            const subProjects = Object.keys(frontmatter).filter(key => key.endsWith('_sub_done_today'));
            for (const subProject of subProjects) {
                frontmatter[subProject] = 0;
            }
        }
		const newFileContent = stringifyFrontmatter(frontmatter) + content;
		this.app.vault.modify(file, newFileContent)

		new Notice(file.name + " cleaned up")
	})
}