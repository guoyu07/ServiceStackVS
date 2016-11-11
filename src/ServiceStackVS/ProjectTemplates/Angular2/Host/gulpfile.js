/*global require*/
(function () {
    var fs = require('fs');
    var path = require('path');
    // include gulp
    var gulp = require('gulp');
    var gulpUtil = require('gulp-util');
    // include plug-ins
    var del = require('del');
    var uglify = require('gulp-uglify');
    var newer = require('gulp-newer');
    var useref = require('gulp-useref');
    var gulpif = require('gulp-if');
    var minifyCss = require('gulp-clean-css');
    var gulpReplace = require('gulp-replace');
    var htmlBuild = require('gulp-htmlbuild');
    var eventStream = require('event-stream');
    var jspmBuild = require('gulp-jspm');
    var rename = require('gulp-rename');
    var runSequence = require('run-sequence');
    var argv = require('yargs').argv;
    var nugetRestore = require('gulp-nuget-restore');
    var msbuild = require('gulp-msbuild');
    var msdeploy = require('gulp-msdeploy');

    var webRoot = 'wwwroot/';
    var webBuildDir = argv.serviceStackSettingsDir || './wwwroot_build/';
    var configFile = 'config.json';
    var configDir = webBuildDir + 'publish/';
    var configPath = configDir + configFile;
    var appSettingsFile = 'appsettings.txt';
    var appSettingsDir = webBuildDir + 'deploy/';
    var appSettingsPath = appSettingsDir + appSettingsFile;

    var COPY_SERVER_FILES = [
        { src: './bin/**/*', dest: 'bin/' },
        { src: './App_Data/**/*', dest: 'App_Data/' },
        { src: './Global.asax' },
        { src: webBuildDir + 'deploy/*.*' },
        {
            src: './web.config',
            afterReplace: [{
                from: '<compilation debug="true" targetFramework="4.5"',
                to: '<compilation targetFramework="4.5"'
            }]
        }
    ];

    var COPY_CLIENT_FILES = [
        { src: './img/**/*', dest: 'img/' },
        { src: './src/**/*.html', dest: 'src/' },
        { src: './config.js' },
        { src: './jspm_packages/system-polyfills.js' }
    ];

    function createConfigsIfMissing() {
        if (!fs.existsSync(configPath)) {
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir);
            }
            fs.writeFileSync(configPath, JSON.stringify({
                "iisApp": "$safeprojectname$",
                "serverAddress": "deploy-server.example.com",
                "userName": "{WebDeployUserName}",
                "password": "{WebDeployPassword}"
            }, null, 4));
        }
        if (!fs.existsSync(appSettingsPath)) {
            if (!fs.existsSync(appSettingsDir)) {
                fs.mkdirSync(appSettingsDir);
            }
            fs.writeFileSync(appSettingsPath,
                '# Release App Settings\r\nDebugMode false');
        }
    }

    // Deployment config
    createConfigsIfMissing();
    var config = require(configPath);

    // htmlbuild replace for CDN references
    function pipeTemplate(block, template) {
        eventStream.readArray([
            template
        ].map(function (str) {
            return block.indent + str;
        })).pipe(block);
    }

    function copyFilesTask(copy, cb) {
        var dest = copy.dest || '';
        var src = copy.src;
        var copyTask = gulp.src(src);
        if (copy.afterReplace) {
            for (var i = 0; i < copy.afterReplace.length; i++) {
                var replace = copy.afterReplace[i];
                copyTask = copyTask.pipe(gulpReplace(replace.from, replace.to));
            }
        }
        if (copy.after) {
            copyTask = copyTask.pipe(copy.after());
        }

        copyTask = copyTask
            .pipe(newer(webRoot + dest))
            .pipe(gulp.dest(webRoot + dest));

        copyTask.on('finish', function () {
            gulpUtil.log(gulpUtil.colors.green('Copied ' + copy.src));
            cb();
        });
        return copyTask;
    }

    // Tasks

    gulp.task('www-copy-server', function (done) {
        var completed = 0;
        var COPY_FILES = COPY_SERVER_FILES;

        for (var i = 0; i < COPY_FILES.length; i++) {
            (function (index) {
                copyFilesTask(COPY_FILES[index], function () {
                    if (++completed == COPY_FILES.length)
                        done();
                });
            })(i);
        }
    });
    gulp.task('www-copy-client', function (done) {
        var completed = 0;
        var COPY_FILES = COPY_CLIENT_FILES;

        for (var i = 0; i < COPY_FILES.length; i++) {
            (function (index) {
                copyFilesTask(COPY_FILES[index], function () {
                    if (++completed == COPY_FILES.length)
                        done();
                });
            })(i);
        }
    });
    gulp.task('www-clean-server', function (done) {
        var binPath = webRoot + '/bin/';
        del(binPath, done);
    });
    gulp.task('www-clean-client', function (done) {
        del([
            webRoot + '**/*.*',
            '!wwwroot/bin/**/*.*', //Don't delete dlls
            '!wwwroot/App_Data/**/*.*', //Don't delete App_Data
            '!wwwroot/**/*.asax', //Don't delete asax
            '!wwwroot/**/*.config', //Don't delete config
            '!wwwroot/appsettings.txt' //Don't delete deploy settings
        ], done);
    });
    gulp.task('www-bundle-html', function () {
        return gulp.src('./default.html')
            .pipe(gulpif('*.js', uglify()))
            .pipe(gulpif('*.css', minifyCss()))
            .pipe(useref())
            .pipe(htmlBuild({
                appbundle: function (block) {
                    pipeTemplate(block, '<script src="/main.js"></script>'); // file generated by 'www-jspm-build' task below
                }
            }))
            .pipe(gulp.dest(webRoot));
    });
    gulp.task('www-jspm-build', function () {
        return gulp.src('./src/main.js')
            .pipe(jspmBuild({ selfExecutingBundle: true, minify: true }))
			.pipe(rename('main.js'))
            .pipe(gulp.dest(webRoot));
    });
    gulp.task('www-jspm-deps', function () {
        return gulp.src('./src/app.js')
            .pipe(jspmBuild({ arithmetic: '- [./src/**/*]' }))
            .pipe(rename('deps.lib.js'))
            .pipe(gulp.dest('./'));
    });
    gulp.task('www-msbuild', function () {
        return gulp.src('../../$safeprojectname$.sln')
            .pipe(nugetRestore())
            .pipe(msbuild({
                targets: ['Clean', 'Build'],
                stdout: true,
                verbosity: 'quiet'
            }
            ));
    });
    gulp.task('www-msdeploy-pack', function () {
        return gulp.src('wwwroot/')
            .pipe(msdeploy({
                verb: 'sync',
                sourceType: 'iisApp',
                dest: {
                    'package': path.resolve('./webdeploy.zip')
                }
            }));
    });
    gulp.task('www-msdeploy-push', function () {
        return gulp.src('./webdeploy.zip')
            .pipe(msdeploy({
                verb: 'sync',
                allowUntrusted: 'true',
                sourceType: 'package',
                dest: {
                    iisApp: config.iisApp,
                    wmsvc: config.serverAddress,
                    UserName: config.userName,
                    Password: config.password
                }
            }));
    });

    gulp.task('default', function (callback) {
        runSequence('01-package-server', '02-package-client',
                callback);
    });

    gulp.task('00-update-deps-js', function (callback) {
        runSequence('www-msbuild', 'www-jspm-deps',
                callback);
    });

    gulp.task('01-package-server', function (callback) {
        runSequence('www-msbuild', 'www-clean-server',
            [
                'www-copy-server'
            ],
            callback);
    });

    gulp.task('02-package-client', function (callback) {
        runSequence('www-clean-client',
            [
                'www-copy-client',
                'www-bundle-html'
            ],
            'www-jspm-build',
            callback);
    });

    gulp.task('03-deploy-app', function (callback) {
        runSequence('www-msdeploy-pack', 'www-msdeploy-push',
            callback);
    });

    gulp.task('package-and-deploy', function (callback) {
        runSequence('01-package-server', '02-package-client', '03-deploy-app',
            callback);
    });

})();