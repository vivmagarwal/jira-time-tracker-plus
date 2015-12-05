document.addEventListener('DOMContentLoaded', onDOMContentLoaded, false);

function onDOMContentLoaded () {

    chrome.storage.sync.get({
        username: '',
        password: '',
        description: '',
        baseUrl: '',
        apiExtension: '',
        jql: ''
    }, 
    init);

    function init (options) {

        var error = '';

        if(!options.username){
            return errorMessage('Missing username');
        }
        if(!options.password){
            return errorMessage('Missing password');
        }
        if(!options.baseUrl){
            return errorMessage('Missing base URL');
        }
        if(!options.apiExtension){
            return errorMessage('Missing API extension');
        }

        var JIRA = JiraAPI(options.baseUrl, options.apiExtension, options.username, options.password, options.jql);

        JIRA.login()
        .success(onLoginSuccess)
        .error(genericResponseError);


        function onLoginSuccess () {

            JIRA.getAssignedIssues()
            .success(function (issuesResponse) {

                var promises = [];

                issuesResponse.issues.forEach(function (issue) {
                    promises.push(getWorklog(issue.key, issuesResponse.issues));
                });

                // when all worklogs are fetched, draw the table
                $.when.apply($, promises)
                .done(function () {

                    setProjectTitle(options.description);
                    drawIssuesTable(issuesResponse.issues);

                });

            })
            .error(genericResponseError);

        }

        function getWorklog (id, issues) {

            return JIRA.getIssueWorklog(id)
            .success(function (worklogResponse) {

                issues.forEach(function (issue) {
                    if(issue.key === id){
                        issue.totalTime = sumWorklogs(worklogResponse.worklogs);
                    } 
                });

            })
            .error(genericResponseError);

        }




        // HTML generating

        function setProjectTitle (projectName) {
            document.getElementById('project-name').innerText = projectName;
        }

        function drawIssuesTable (issues) {

            var logTable = document.getElementById('jira-log-time-table');

            issues.forEach(function (issue) {
                var row = generateLogTableRow(issue.key, issue.fields.summary, issue.totalTime);
                logTable.appendChild(row)
            });

        }

        function generateLogTableRow (id, summary, time) {

            // Issue ID cell
            var idCell = buildHTML('td', id, {
                class: 'issue-id'
            });

            // Issue summary cell
            var summaryCell = buildHTML('td', summary, {
                class: 'issue-summary'
            });

            // Issue total worklog sum
            var totalTimeCell = buildHTML('td', time, {
                class: 'issue-total-time-spent',
                'data-issue-id' : id
            });
            
            // Time input 
            var timeInput = buildHTML('input', null, {
                class: 'issue-time-input',
                'data-issue-id': id
            });
            
            // Time input cell
            var timeInputCell = buildHTML('td');
            timeInputCell.appendChild(timeInput);

            // Date input
            var dateInput = buildHTML('input', null, {
                type: 'date',
                class: 'log-date-input',
                value: new Date().toDateInputValue(),
                'data-issue-id': id
            });
            
            // Date input cell
            var dateInputCell = buildHTML('td');
            dateInputCell.appendChild(dateInput);

            var actionButton = buildHTML('input', null, {
                type: 'button',
                value: 'Log Time',
                class: 'log-time-btn',
                'data-issue-id': id
            });

            actionButton.addEventListener('click', logTimeClick);

            // Action button cell
            var actionCell = buildHTML('td');
            actionCell.appendChild(actionButton);

            // building up row from cells
            var row = buildHTML('tr');

            row.appendChild(idCell);
            row.appendChild(summaryCell);
            row.appendChild(totalTimeCell);
            row.appendChild(timeInputCell);
            row.appendChild(dateInputCell);
            row.appendChild(actionCell);

            return row;

        }

        function logTimeClick (evt) {

            // clear error messages
            errorMessage('');

            var issueId = evt.target.getAttribute('data-issue-id')
            var timeInput = document.querySelector('input[data-issue-id=' + issueId + ']');
            var dateString = document.querySelector('input[class=log-date-input][data-issue-id=' + issueId + ']').value;

            JIRA.updateWorklog(issueId, timeInput.value, new Date(dateString))
            .success(function (data) {
                refreshWorklog(issueId);
            })
            .error(genericResponseError);

        }

        function refreshWorklog (issueId) {

            JIRA.getIssueWorklog(issueId)
            .success(function (data) {
                var totalTimeSpent = document.querySelector('td[data-issue-id=' + issueId + ']');
                totalTimeSpent.innerText = sumWorklogs(data.worklogs);
            });

        }




        /* 
            Helper functions 
        */

        // html generator
        function buildHTML (tag, html, attrs) {

            var element = document.createElement(tag);

            if(html) element.innerHTML = html;

            for (attr in attrs) {
                if(attrs[attr] === false) continue;
                element.setAttribute(attr, attrs[attr]);
            }

            return element;
        }

        // worklog sum in 'jira format'
        function sumWorklogs (worklogs) {

            var totalSeconds = worklogs.reduce(function(a, b){
                return {timeSpentSeconds: a.timeSpentSeconds + b.timeSpentSeconds}
            }, {timeSpentSeconds:0}).timeSpentSeconds;

            var totalWeeks = Math.floor(totalSeconds / 144000);
            totalSeconds = totalSeconds % 144000;
            var totalDays = Math.floor(totalSeconds / 28800);
            totalSeconds = totalSeconds % 28800;
            var totalHours = Math.floor(totalSeconds / 3600);
            totalSeconds = totalSeconds % 3600;
            var totalMinutes = Math.floor(totalSeconds / 60);

            return (totalWeeks ? totalWeeks + 'w' : '') + ' ' + (totalDays ? totalDays + 'd' : '') + ' ' + (totalHours ? totalHours + 'h' : '') + ' ' + (totalMinutes ? totalMinutes + 'min' : '');

        }

        function genericResponseError (error) {
            errorMessage('Server error ' + error.responseText);
        }

        function errorMessage (message) {
            var error = document.getElementById('error')
            error.innerText = message;
            error.style.display = 'block';
        }


        $(document).ajaxStart(function() {
            document.getElementById('loading').style.display = 'block';
        })
        .ajaxComplete(function() {
            document.getElementById('loading').style.display = 'none';
        });

        // adding helper to pre-select today's date in the datepicker
        Date.prototype.toDateInputValue = (function() {
            var local = new Date(this);
            local.setMinutes(this.getMinutes() - this.getTimezoneOffset());
            return local.toJSON().slice(0,10);
        });

    }

}

