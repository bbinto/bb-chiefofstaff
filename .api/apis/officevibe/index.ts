import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core'
import Oas from 'oas';
import APICore from 'api/dist/core';
import definition from './openapi.json';

class SDK {
  spec: Oas;
  core: APICore;

  constructor() {
    this.spec = Oas.init(definition);
    this.core = new APICore(this.spec, 'officevibe/unknown (api/6.1.3)');
  }

  /**
   * Optionally configure various options that the SDK allows.
   *
   * @param config Object of supported SDK options and toggles.
   * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
   * should be represented in milliseconds.
   */
  config(config: ConfigOptions) {
    this.core.setConfig(config);
  }

  /**
   * If the API you're using requires authentication you can supply the required credentials
   * through this method and the library will magically determine how they should be used
   * within your API request.
   *
   * With the exception of OpenID and MutualTLS, it supports all forms of authentication
   * supported by the OpenAPI specification.
   *
   * @example <caption>HTTP Basic auth</caption>
   * sdk.auth('username', 'password');
   *
   * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
   * sdk.auth('myBearerToken');
   *
   * @example <caption>API Keys</caption>
   * sdk.auth('myApiKey');
   *
   * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
   * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
   * @param values Your auth credentials for the API; can specify up to two strings or numbers.
   */
  auth(...values: string[] | number[]) {
    this.core.setAuth(...values);
    return this;
  }

  /**
   * If the API you're using offers alternate server URLs, and server variables, you can tell
   * the SDK which one to use with this method. To use it you can supply either one of the
   * server URLs that are contained within the OpenAPI definition (along with any server
   * variables), or you can pass it a fully qualified URL to use (that may or may not exist
   * within the OpenAPI definition).
   *
   * @example <caption>Server URL with server variables</caption>
   * sdk.server('https://{region}.api.example.com/{basePath}', {
   *   name: 'eu',
   *   basePath: 'v14',
   * });
   *
   * @example <caption>Fully qualified server URL</caption>
   * sdk.server('https://eu.api.example.com/v14');
   *
   * @param url Server URL
   * @param variables An object of variables to replace into the server URL.
   */
  server(url: string, variables = {}) {
    this.core.setServer(url, variables);
  }

  /**
   * This request creates a new Poll.
   *
   * @summary /polls
   * @throws FetchError<400, types.PollsResponse400> 400
   */
  polls(body: types.PollsBodyParam): Promise<FetchResponse<200, types.PollsResponse200>> {
    return this.core.fetch('/polls', 'post', body);
  }

  /**
   * This request returns all the polls.
   *
   * @summary /polls
   * @throws FetchError<400, types.PollResponse400> 400
   */
  poll(metadata?: types.PollMetadataParam): Promise<FetchResponse<200, types.PollResponse200>> {
    return this.core.fetch('/polls', 'get', metadata);
  }

  /**
   * The request returns the information for a specified user.
   *
   * @summary /users/:email
   * @throws FetchError<400, types.UsersidResponse400> 400
   */
  usersid(metadata: types.UsersidMetadataParam): Promise<FetchResponse<200, types.UsersidResponse200>> {
    return this.core.fetch('/users/{email}', 'get', metadata);
  }

  /**
   * The request invite a new user or update the existing user.
   *
   * @summary /users/:email
   * @throws FetchError<400, types.EmployeesaveResponse400> 400
   */
  employeesave(body: types.EmployeesaveBodyParam, metadata: types.EmployeesaveMetadataParam): Promise<FetchResponse<200, types.EmployeesaveResponse200>>;
  employeesave(metadata: types.EmployeesaveMetadataParam): Promise<FetchResponse<200, types.EmployeesaveResponse200>>;
  employeesave(body?: types.EmployeesaveBodyParam | types.EmployeesaveMetadataParam, metadata?: types.EmployeesaveMetadataParam): Promise<FetchResponse<200, types.EmployeesaveResponse200>> {
    return this.core.fetch('/users/{email}', 'post', body, metadata);
  }

  /**
   * The request creates a new group.
   *
   * @summary /groups
   * @throws FetchError<400, types.GroupsaveResponse400> 400
   */
  groupsave(body: types.GroupsaveBodyParam): Promise<FetchResponse<200, types.GroupsaveResponse200>> {
    return this.core.fetch('/groups', 'post', body);
  }

  /**
   * This request returns the information of a specified group.
   *
   * @summary /groups?groupId
   * @throws FetchError<400, types.GroupsidResponse400> 400
   */
  groupsid(metadata: types.GroupsidMetadataParam): Promise<FetchResponse<200, types.GroupsidResponse200>> {
    return this.core.fetch('/groups', 'get', metadata);
  }

  /**
   * This request adds users to a specified group.
   *
   * @summary /groups/addUsers
   * @throws FetchError<400, types.GroupaddemployeeResponse400> 400
   */
  groupaddemployee(body: types.GroupaddemployeeBodyParam): Promise<FetchResponse<200, types.GroupaddemployeeResponse200>> {
    return this.core.fetch('/groups/addUsers', 'post', body);
  }

  /**
   * This request returns feedback conversations.
   *
   * @summary /feedback
   * @throws FetchError<400, types.FeedbacklistResponse400> 400
   */
  feedbacklist(metadata?: types.FeedbacklistMetadataParam): Promise<FetchResponse<200, types.FeedbacklistResponse200>> {
    return this.core.fetch('/feedback', 'get', metadata);
  }

  /**
   * This request creates a new Feedback.
   *  WARNING : do not let the user specify his email, enter the email in your back-end.
   *
   * @summary /feedback
   * @throws FetchError<400, types.FeedbackResponse400> 400
   */
  feedback(body: types.FeedbackBodyParam): Promise<FetchResponse<200, types.FeedbackResponse200>> {
    return this.core.fetch('/feedback', 'post', body);
  }

  /**
   * This request returns the information for a specified feedback.
   *
   * @summary /feedback/:id
   * @throws FetchError<400, types.FeedbackidResponse400> 400
   */
  feedbackid(metadata: types.FeedbackidMetadataParam): Promise<FetchResponse<200, types.FeedbackidResponse200>> {
    return this.core.fetch('/feedback/{id}', 'get', metadata);
  }

  /**
   * This request removes all users from a specified group.
   *
   * @summary /groups/removeAllUsers
   * @throws FetchError<400, types.GroupsnameremoveallusersResponse400> 400
   */
  groupsnameremoveallusers(body: types.GroupsnameremoveallusersBodyParam): Promise<FetchResponse<200, types.GroupsnameremoveallusersResponse200>> {
    return this.core.fetch('/groups/removeAllUsers', 'post', body);
  }

  /**
   * The request deactivates an user
   *
   * @summary /users/deactivate
   * @throws FetchError<400, types.EmployeeremoveResponse400> 400
   */
  employeeremove(body: types.EmployeeremoveBodyParam): Promise<FetchResponse<200, types.EmployeeremoveResponse200>> {
    return this.core.fetch('/users/deactivate', 'post', body);
  }

  /**
   * This request returns the information for a specified poll.
   *
   * @summary /polls/:id
   * @throws FetchError<400, types.PollsidResponse400> 400
   */
  pollsid(metadata: types.PollsidMetadataParam): Promise<FetchResponse<200, types.PollsidResponse200>> {
    return this.core.fetch('/polls/{id}', 'get', metadata);
  }

  /**
   * The request returns the engagement reports for a list of dates and groups specified.
   *
   * @summary /engagement
   * @throws FetchError<400, types.EngagementResponse400> 400
   */
  engagement(body: types.EngagementBodyParam): Promise<FetchResponse<200, types.EngagementResponse200>> {
    return this.core.fetch('/engagement', 'post', body);
  }

  /**
   * This request removes a group.
   *
   * @summary /groups/remove
   * @throws FetchError<400, types.GroupremoveResponse400> 400
   */
  groupremove(body: types.GroupremoveBodyParam): Promise<FetchResponse<200, types.GroupremoveResponse200>> {
    return this.core.fetch('/groups/remove', 'post', body);
  }

  /**
   * The request returns all the groups information of the network.
   *
   * @summary /groups
   * @throws FetchError<400, types.GroupResponse400> 400
   */
  group(): Promise<FetchResponse<200, types.GroupResponse200>> {
    return this.core.fetch('/groups#', 'get');
  }

  /**
   * The request returns the information of all the Users of the network.
   *
   * @summary /users
   * @throws FetchError<400, types.UsersResponse400> 400
   */
  users(): Promise<FetchResponse<200, types.UsersResponse200>> {
    return this.core.fetch('/users', 'get');
  }

  /**
   * /ping
   *
   * @throws FetchError<400, types.PingResponse400> 400
   * @throws FetchError<401, types.PingResponse401> 401
   */
  ping(): Promise<FetchResponse<200, types.PingResponse200>> {
    return this.core.fetch('/ping', 'get');
  }

  /**
   * This request removes users from a specified group.
   *
   * @summary /groups/removeUsers
   * @throws FetchError<400, types.GroupremoveemployeeResponse400> 400
   */
  groupremoveemployee(body: types.GroupremoveemployeeBodyParam): Promise<FetchResponse<200, types.GroupremoveemployeeResponse200>> {
    return this.core.fetch('/groups/removeUsers', 'post', body);
  }

  /**
   * The request will synchronize the company's users, groups and group relations.
   *
   * @summary /sync
   * @throws FetchError<400, types.SyncResponse400> 400
   */
  sync(body: types.SyncBodyParam): Promise<FetchResponse<200, types.SyncResponse200>> {
    return this.core.fetch('/sync', 'post', body);
  }

  /**
   * This request returns a list of the custom labels that can be added to feedbacks.
   *
   * @summary /feedbackLabels
   * @throws FetchError<400, types.FeedbacklabelsResponse400> 400
   */
  feedbacklabels(): Promise<FetchResponse<200, types.FeedbacklabelsResponse200>> {
    return this.core.fetch('/feedbackLabels', 'get');
  }
}

const createSDK = (() => { return new SDK(); })()
;

export default createSDK;

export type { EmployeeremoveBodyParam, EmployeeremoveResponse200, EmployeeremoveResponse400, EmployeesaveBodyParam, EmployeesaveMetadataParam, EmployeesaveResponse200, EmployeesaveResponse400, EngagementBodyParam, EngagementResponse200, EngagementResponse400, FeedbackBodyParam, FeedbackResponse200, FeedbackResponse400, FeedbackidMetadataParam, FeedbackidResponse200, FeedbackidResponse400, FeedbacklabelsResponse200, FeedbacklabelsResponse400, FeedbacklistMetadataParam, FeedbacklistResponse200, FeedbacklistResponse400, GroupResponse200, GroupResponse400, GroupaddemployeeBodyParam, GroupaddemployeeResponse200, GroupaddemployeeResponse400, GroupremoveBodyParam, GroupremoveResponse200, GroupremoveResponse400, GroupremoveemployeeBodyParam, GroupremoveemployeeResponse200, GroupremoveemployeeResponse400, GroupsaveBodyParam, GroupsaveResponse200, GroupsaveResponse400, GroupsidMetadataParam, GroupsidResponse200, GroupsidResponse400, GroupsnameremoveallusersBodyParam, GroupsnameremoveallusersResponse200, GroupsnameremoveallusersResponse400, PingResponse200, PingResponse400, PingResponse401, PollMetadataParam, PollResponse200, PollResponse400, PollsBodyParam, PollsResponse200, PollsResponse400, PollsidMetadataParam, PollsidResponse200, PollsidResponse400, SyncBodyParam, SyncResponse200, SyncResponse400, UsersResponse200, UsersResponse400, UsersidMetadataParam, UsersidResponse200, UsersidResponse400 } from './types';
