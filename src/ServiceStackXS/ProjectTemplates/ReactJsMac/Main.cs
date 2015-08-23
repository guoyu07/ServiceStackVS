﻿using System;
using System.Drawing;
using MonoMac.Foundation;
using MonoMac.AppKit;
using MonoMac.ObjCRuntime;

namespace ${Namespace}
{
	public static class MainClass
	{
		public static string HostUrl = "http://localhost:3337/";
		public static AppHost App;

		static void Main (string[] args)
		{
			App = new AppHost ();
			App.Init ().Start (HostUrl);

			NSApplication.Init ();
			NSApplication.Main (args);
		}
	}
}

