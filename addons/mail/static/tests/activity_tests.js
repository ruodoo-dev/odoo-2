odoo.define('mail.activity_view_tests', function (require) {
'use strict';

var ActivityView = require('mail.ActivityView');
var testUtils = require('web.test_utils');

var createActionManager = testUtils.createActionManager;

var createView = testUtils.createView;
var ACTIVITY_DATA = {
    "grouped_activities":{
       "13":{
          "1":{
             "count":1,
             "state":"planned",
             "o_closest_deadline":"2018-08-16",
             "ids":[
                1
             ]
          }
       },
       "30":{
          "1":{
             "count":1,
             "state":"today",
             "o_closest_deadline":"2018-08-16",
             "ids":[
                2
             ]
          },
          "2":{
             "count":2,
             "state":"overdue",
             "o_closest_deadline":"2018-09-16",
             "ids":[
                3
             ]
          }
       }
    },
    "activity_types":[
       [
          1,
          "Email",
          [
             {
                "id":9,
                "name":"Task: Rating Request"
             },
             {
                "id":8,
                "name":"Task: Reception Acknowledgment"
             }
          ]
       ],
       [
         2,
         "Call",
         []
      ]
    ],
    "model":"task",
    "res_ids":[
       [
          30,
          "Office planning"
       ],
       [
          13,
          "Meeting Room Furnitures"
       ]
    ]
};

QUnit.module('mail', {}, function () {
QUnit.module('activity view', {
    beforeEach: function () {
        this.data = {
            task: {
                fields: {
                    id: {string: 'ID', type: 'integer'},
                },
                records: [
                    {id: 13},
                    {id: 30},
                ]
            },
            partner: {
                fields: {
                    display_name: { string: "Displayed name", type: "char" },
                },
                records: [{
                    id: 2,
                    display_name: "first partner",
                }]
            },
            'mail.activity': {
                fields: {
                    activity_type_id: { string: "Activity type", type: "many2one", relation: "mail.activity.type" },
                    display_name: { string: "Display name", type: "char" },
                    date_deadline: { string: "Due Date", type: "date" },
                    can_write: { string: "Can write", type: "boolean" },
                    state: {
                        string: 'State',
                        type: 'selection',
                        selection: [['overdue', 'Overdue'], ['today', 'Today'], ['planned', 'Planned']],
                    },
                    mail_template_ids: { string: "Mail templates", type: "many2many", relation: "mail.template" },
                    user_id: { string: "Assigned to", type: "many2one", relation: 'partner' },
                },
                records:[
                    {
                        id: 1,
                        display_name: "An activity",
                        date_deadline: moment().add(3, "days").format("YYYY-MM-DD"), // now
                        can_write: true,

                        state: "planned",
                        activity_type_id: 1,
                        mail_template_ids: [8, 9],
                        user_id:2,
                    },{
                        id: 2,
                        display_name: "An activity",
                        date_deadline: moment().format("YYYY-MM-DD"), // now
                        can_write: true,
                        state: "today",
                        activity_type_id: 1,
                        mail_template_ids: [8, 9],
                        user_id:2,
                    },{
                        id: 3,
                        display_name: "An activity",
                        date_deadline: moment().subtract(2, "days").format("YYYY-MM-DD"), // now
                        can_write: true,
                        state: "overdue",
                        activity_type_id: 2,
                        mail_template_ids: [],
                        user_id:2,
                    }
                ],
            },
            'mail.template': {
                fields: {
                    name: { string: "Name", type: "char" },
                },
                records: [
                    { id: 8, name: "Template1" },
                    { id: 9, name: "Template2" },
                ],
            },
            'mail.activity.type': {
                fields: {
                    name: { string: "Name", type: "char" },
                },
                records: [
                    { id: 1, name: "Email" },
                    { id: 2, name: "Call" },
                ],
            },
        };
    }
});

QUnit.test('activity view: simple activity rendering', async function (assert) {
    assert.expect(7);
    var activity = await createView({
        View: ActivityView,
        model: 'task',
        data: this.data,
        arch: '<activity string="Task"/>',
        mockRPC: function(route, args) {
            if (args.method === 'get_activity_data') {
                return Promise.resolve(ACTIVITY_DATA);
            }
            return this._super(route, args);
        },
    });

    assert.containsOnce(activity, 'table',
        'should have a table');
    assert.ok(activity.$('table thead tr:first th:nth-child(2) span:first:contains(Email)').length,
        'should contain "Email" in header of first column');
    assert.ok(activity.$('table thead tr:first th:nth-child(3) span:first:contains(Call)').length,
        'should contain "Call" in header of second column');
    assert.ok(activity.$('table tbody tr:first td:first:contains(Office planning)').length,
        'should contain "Office planning" in first colum of first row');
    assert.ok(activity.$('table tbody tr:nth-child(2) td:first:contains(Meeting Room Furnitures)').length,
        'should contain "Meeting Room Furnitures" in first colum of second row');
    assert.ok(activity.$('table tbody tr:first td:nth-child(2).today .o_closest_deadline:contains(Aug 16)').length,
        'should contain an activity for today with date Aug 16 in second cell of first line');
    assert.ok(activity.$('table tbody tr:nth-child(2) td:nth-child(2).planned .o_closest_deadline:contains(Aug 16)').length,
        'should contain a planned activity with date Aug 16 in second cell of second line');
    activity.destroy();
});

QUnit.test('activity view: no content rendering', async function (assert) {
    assert.expect(2);
    var activity = await createView({
        View: ActivityView,
        model: 'task',
        data: this.data,
        arch: '<activity string="Task"/>',
        mockRPC: function (route, args) {
            if (args.method === 'get_activity_data') {
                return Promise.resolve({ activity_types: [] });
            }
            return this._super(route, args);
        },
    });

    assert.containsOnce(activity, '.o_view_nocontent',
        "should display the no content helper");
    assert.strictEqual(activity.$('.o_view_nocontent .o_view_nocontent_empty_folder').text().trim(),
        "No data to display",
        "should display the no content helper text");

    activity.destroy();
});

QUnit.test('activity view: batch send mail on activity', async function (assert) {
    assert.expect(6);
    var activity = await createView({
        View: ActivityView,
        model: 'task',
        data: this.data,
        arch: '<activity string="Task"/>',
        mockRPC: function(route, args) {
            if (args.method === 'activity_send_mail'){
                assert.step(JSON.stringify(args.args));
                return Promise.resolve();
            }
            if (args.method === 'get_activity_data') {
                return Promise.resolve(ACTIVITY_DATA);
            }
            return this._super(route, args);
        },
    });
    assert.notOk(activity.$('table thead tr:first th:nth-child(2) span:nth-child(2) .dropdown-menu.show').length,
        'dropdown shouldn\'t be displayed');

    testUtils.dom.click(activity.$('table thead tr:first th:nth-child(2) span:nth-child(2) i.fa-ellipsis-v'));
    assert.ok(activity.$('table thead tr:first th:nth-child(2) span:nth-child(2) .dropdown-menu.show').length,
        'dropdown should have appeared');

    testUtils.dom.click(activity.$('table thead tr:first th:nth-child(2) span:nth-child(2) .dropdown-menu.show .o_send_mail_template:first:contains(Task: Rating Request)'));
    assert.notOk(activity.$('table thead tr:first th:nth-child(2) span:nth-child(2) .dropdown-menu.show').length,
        'dropdown shouldn\'t be displayed');

    testUtils.dom.click(activity.$('table thead tr:first th:nth-child(2) span:nth-child(2) i.fa-ellipsis-v'));
    testUtils.dom.click(activity.$('table thead tr:first th:nth-child(2) span:nth-child(2) .dropdown-menu.show .o_send_mail_template:nth-child(2):contains(Task: Reception Acknowledgment)'));
    assert.verifySteps([
        '[[13,30],9]', // send mail template 9 on tasks 13 and 30
        '[[13,30],8]',  // send mail template 8 on tasks 13 and 30
    ]);

    activity.destroy();
});

QUnit.test('activity view: activity widget', async function (assert) {
    assert.expect(16);
    var activity = await createView({
        View: ActivityView,
        model: 'task',
        data: this.data,
        arch: '<activity string="Task"/>',
        mockRPC: function(route, args) {
            if (args.method === 'activity_send_mail'){
                assert.deepEqual([[30],8],args.args, "Should send template 8 on record 30");
                assert.step('activity_send_mail');
                return Promise.resolve();
            }
            if (args.method === 'action_feedback_schedule_next'){
                assert.deepEqual([[3]],args.args, "Should execute action_feedback_schedule_next on activity 3 only ");
                assert.equal(args.kwargs.feedback, "feedback2");
                assert.step('action_feedback_schedule_next');
                return Promise.resolve({serverGeneratedAction: true});
            }
            if (args.method === 'get_activity_data') {
                return Promise.resolve(ACTIVITY_DATA);
            }
            return this._super(route, args);
        },
        intercepts: {
            do_action: function (ev) {
                var action = ev.data.action;
                if (action.serverGeneratedAction) {
                    assert.step('serverGeneratedAction');
                } else if (action.res_model === 'mail.compose.message') {
                    assert.deepEqual({
                        default_model: "task",
                        default_res_id: 30,
                        default_template_id: 8,
                        default_use_template: true,
                        force_email: true
                        }, action.context);
                    assert.step("do_action_compose");
                } else if (action.res_model === 'mail.activity') {
                    assert.deepEqual({
                        "default_res_id": 30,
                        "default_res_model": "task"
                    }, action.context);
                    assert.step("do_action_activity");
                } else {
                    assert.step("Unexpected action");
                }
            },
        },
    });
    var today = activity.$('table tbody tr:first td:nth-child(2).today');
    var dropdown = today.find('.dropdown-menu.o_activity');

    await testUtils.dom.click(today.find('.o_closest_deadline'));
    assert.hasClass(dropdown,'show', "dropdown should be displayed");
    assert.ok(dropdown.find('.o_activity_color_today:contains(Today)').length, "Title should be today");
    assert.ok(dropdown.find('.o_activity_title_entry[data-activity-id="2"]:first div:contains(template8)').length,
        "template8 should be available");
    assert.ok(dropdown.find('.o_activity_title_entry[data-activity-id="2"]:eq(1) div:contains(template9)').length,
        "template9 should be available");

    await testUtils.dom.click(dropdown.find('.o_activity_title_entry[data-activity-id="2"]:first .o_activity_template_preview'));
    await testUtils.dom.click(dropdown.find('.o_activity_title_entry[data-activity-id="2"]:first .o_activity_template_send'));
    var overdue = activity.$('table tbody tr:first td:nth-child(3).overdue');
    await testUtils.dom.click(overdue.find('.o_closest_deadline'));
    dropdown = overdue.find('.dropdown-menu.o_activity');
    assert.notOk(dropdown.find('.o_activity_title div div div:first span').length,
        "No template should be available");

    await testUtils.dom.click(dropdown.find('.o_schedule_activity'));
    await testUtils.dom.click(overdue.find('.o_closest_deadline'));
    await testUtils.dom.click(dropdown.find('.o_mark_as_done'));
    dropdown.find('#activity_feedback').val("feedback2");

    await testUtils.dom.click(dropdown.find('.o_activity_popover_done_next'));
    assert.verifySteps([
        "do_action_compose",
        "activity_send_mail",
        "do_action_activity",
        "action_feedback_schedule_next",
        "serverGeneratedAction"
        ]);

    activity.destroy();
});
QUnit.test('activity view: no group_by_menu and no time_range_menu', async function (assert) {
    assert.expect(4);

    var actionManager = await createActionManager({
        actions: [{
            id: 1,
            name: 'Task Action',
            res_model: 'task',
            type: 'ir.actions.act_window',
            views: [[false, 'activity']],
        }],
        archs: {
            'task,false,activity': '<activity></activity>',
            'task,false,search': '<search></search>',
        },
        data: this.data,
        session: {
            user_context: {lang: 'zz_ZZ'},
        },
        mockRPC: function(route, args) {
            if (args.method === 'get_activity_data') {
                assert.deepEqual(args.kwargs.context, {lang: 'zz_ZZ'},
                    'The context should have been passed');
                return Promise.resolve(ACTIVITY_DATA);
            }
            return this._super(route, args);
        },
    });

    await actionManager.doAction(1);

    assert.containsN(actionManager, '.o_search_options .o_dropdown button:visible', 2,
        "only two elements should be available in view search");
    assert.isVisible(actionManager.$('.o_search_options .o_dropdown button.o_filters_menu_button'),
        "filter should be available in view search");
    assert.isVisible(actionManager.$('.o_search_options .o_dropdown button.o_favorites_menu_button'),
        "favorites should be available in view search");
    actionManager.destroy();
});

});
});
