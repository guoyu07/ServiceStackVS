﻿using System;
using System.Collections.Generic;
using System.ComponentModel.Composition;
using System.ComponentModel.Composition.Hosting;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Xml.Linq;
using EnvDTE;
using Microsoft.VisualStudio.ComponentModelHost;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.TemplateWizard;
using NuGet.VisualStudio;
using IServiceProvider = Microsoft.VisualStudio.OLE.Interop.IServiceProvider;

namespace ServiceStackVS.Wizards
{
    public class NodeJSHelperWizard : IWizard
    {
        [Import]
        internal IVsPackageInstaller Installer { get; set; }
        [Import]
        internal IVsPackageInstallerServices PackageServices { get; set; }

        private List<NpmPackage> npmPackages;
        //private List<BowerPackage> bowerPackages; 

        /// <summary>
        /// Parses XML from WizardData and installs required npm packages
        /// </summary>
        /// <example>
        /// <![CDATA[
        /// <NodeJSRequirements requiresNpm="true">
        ///     <npm-package id="grunt"/>
        ///     <npm-package id="grunt-cli" />
        ///     <npm-package id="gulp" />
        ///     <npm-package id="bower" />
        /// </NodeJSRequirements>]]>
        /// </example>
        /// <param name="automationObject"></param>
        /// <param name="replacementsDictionary"></param>
        /// <param name="runKind"></param>
        /// <param name="customParams"></param>
        public void RunStarted(object automationObject, Dictionary<string, string> replacementsDictionary, WizardRunKind runKind, object[] customParams)
        {
            if (runKind == WizardRunKind.AsNewProject)
            {
                using (var serviceProvider = new ServiceProvider((IServiceProvider) automationObject))
                {
                    var componentModel = (IComponentModel) serviceProvider.GetService(typeof (SComponentModel));
                    using (var container = new CompositionContainer(componentModel.DefaultExportProvider))
                    {
                        container.ComposeParts(this);
                    }
                }
                if (!NodePackageUtils.HasNodeInPath())
                {
                    NodeJSRequiredForm form = new NodeJSRequiredForm();
                    form.ShowDialog();
                    throw new WizardBackoutException("NodeJS installation required");
                }

                string wizardData = replacementsDictionary["$wizarddata$"];
                XElement element = XElement.Parse(wizardData);

                npmPackages =
                    element.Descendants()
                        .Where(x => x.Name.LocalName == "npm-package")
                        .Select(x => new NpmPackage {Id = x.Attribute("id").Value})
                        .ToList();

                //Not needed
                //bowerPackages =
                //    element.Descendants()
                //        .Where(x => x.Name.LocalName == "bower-package")
                //        .Select(x => new BowerPackage {Id = x.Attribute("id").Value})
                //        .ToList();
                
                //Template required globally installed packages, eg bower to enable bower install
                foreach (var package in npmPackages)
                {
                    package.InstallGlobally(); //Installs global npm package if missing
                }
            }
        }

        public void ProjectFinishedGenerating(Project project)
        {
            NodePackageUtils.RunNpmInstall(project.FullName.Substring(0,project.FullName.LastIndexOf("\\", System.StringComparison.Ordinal)));

            NodePackageUtils.RunBowerInstall(project.FullName.Substring(0, project.FullName.LastIndexOf("\\", System.StringComparison.Ordinal)));
        }

        public void ProjectItemFinishedGenerating(ProjectItem projectItem)
        {

        }

        public bool ShouldAddProjectItem(string filePath)
        {
            return true;
        }

        public void BeforeOpeningFile(ProjectItem projectItem)
        {

        }

        public void RunFinished()
        {

        }
    }
}
